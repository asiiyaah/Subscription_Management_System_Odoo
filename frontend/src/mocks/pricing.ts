// In-memory stand-in for the discounts / taxes / product-lookup API until the backend is ready.
// Seed data matches mocks/billing.ts (SEATS10 discount, GST 18% default tax). Resets on reload.
import { ApiError } from "@/services/api";
import { mockDelay, paginate } from "@/mocks/utils";
import type { Paginated, ProductOption } from "@/types/common";
import type {
  Discount,
  DiscountCounts,
  DiscountInput,
  DiscountListQuery,
  DiscountStatus,
  DiscountValidationRequest,
  DiscountValidationResult,
} from "@/types/discount";
import type { TaxInput, TaxRule } from "@/types/tax";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysFromToday = (n: number) => iso(new Date(Date.now() + n * 86_400_000));
const todayIso = () => iso(new Date());

// Products are owned by the Products module (Member 1); this is just a lookup list.
const PRODUCTS: ProductOption[] = [
  { id: 1, name: "Project Management Suite" },
  { id: 2, name: "CRM Cloud" },
  { id: 3, name: "Cloud Storage" },
  { id: 4, name: "Priority Support (add-on)" },
  { id: 5, name: "Extra Seats (add-on)" },
];

const productNames = (ids: number[]) =>
  ids.map((id) => PRODUCTS.find((p) => p.id === id)?.name).filter((name): name is string => Boolean(name));

// --- Discounts -------------------------------------------------------------------

function statusOf(d: Omit<Discount, "status">): DiscountStatus {
  if (!d.active) return "inactive";
  if (d.usage_limit !== undefined && d.used_count >= d.usage_limit) return "used_up";
  if (d.end_date && d.end_date < todayIso()) return "expired";
  if (d.start_date > todayIso()) return "scheduled";
  return "active";
}

function withDerived(d: Omit<Discount, "status" | "product_names">): Discount {
  const full = { ...d, product_names: productNames(d.product_ids) };
  return { ...full, status: statusOf(full) };
}

let nextDiscountId = 1;
const DISCOUNT_SEED: Array<Omit<Discount, "id" | "status" | "product_names">> = [
  { code: "SEATS10", name: "10% off for 5+ seats", type: "percentage", value: 10, min_quantity: 5, start_date: daysFromToday(-120), usage_limit: 100, used_count: 23, applies_to: "subscription", product_ids: [], active: true },
  { code: "WELCOME500", name: "₹500 off first invoice", type: "fixed", value: 500, min_purchase: 1999, start_date: daysFromToday(-60), end_date: daysFromToday(30), usage_limit: 200, used_count: 87, applies_to: "subscription", product_ids: [], active: true },
  { code: "CRM20", name: "20% off CRM Cloud", type: "percentage", value: 20, start_date: daysFromToday(-10), end_date: daysFromToday(5), applies_to: "products", product_ids: [2], used_count: 6, active: true },
  { code: "DIWALI25", name: "Festive 25% off", type: "percentage", value: 25, min_purchase: 999, start_date: daysFromToday(7), end_date: daysFromToday(21), usage_limit: 500, used_count: 0, applies_to: "subscription", product_ids: [], active: true },
  { code: "SUPPORT50", name: "50% off Priority Support", type: "percentage", value: 50, start_date: daysFromToday(-90), end_date: daysFromToday(-15), used_count: 41, applies_to: "products", product_ids: [4], active: true },
  { code: "EARLYBIRD", name: "Early bird ₹1,000 off", type: "fixed", value: 1000, min_purchase: 4999, start_date: daysFromToday(-200), usage_limit: 50, used_count: 50, applies_to: "subscription", product_ids: [], active: true },
  { code: "PARTNER15", name: "Partner programme 15%", type: "percentage", value: 15, min_quantity: 10, start_date: daysFromToday(-30), applies_to: "products", product_ids: [1, 3], used_count: 3, active: false },
];
const DISCOUNTS: Discount[] = DISCOUNT_SEED.map((d) => withDerived({ ...d, id: nextDiscountId++ }));

function findDiscount(id: number): Discount {
  const discount = DISCOUNTS.find((d) => d.id === id);
  if (!discount) throw new ApiError(404, "Discount not found.");
  return discount;
}

function checkDiscount(input: DiscountInput, ignoreId?: number) {
  const code = input.code.trim().toUpperCase();
  if (DISCOUNTS.some((d) => d.code === code && d.id !== ignoreId)) {
    throw new ApiError(409, `The code ${code} is already used by another discount.`);
  }
  if (input.type === "percentage" && input.value > 100) throw new ApiError(422, "A percentage can't be more than 100.");
  if (input.end_date && input.end_date < input.start_date) throw new ApiError(422, "End date must be on or after the start date.");
  if (input.applies_to === "products" && input.product_ids.length === 0) throw new ApiError(422, "Choose at least one product.");
}

function saveDiscount(index: number, next: Omit<Discount, "status" | "product_names">) {
  DISCOUNTS[index] = withDerived(next);
  return structuredClone(DISCOUNTS[index]);
}

export const mockDiscounts = {
  async list(query: DiscountListQuery): Promise<Paginated<Discount>> {
    await mockDelay();
    const rows = DISCOUNTS.map((d) => withDerived(d)); // refresh status against today's date
    return paginate(rows, query, ["code", "name"]);
  },

  async counts(): Promise<DiscountCounts> {
    await mockDelay(250);
    const rows = DISCOUNTS.map((d) => withDerived(d));
    const count = (status: DiscountStatus) => rows.filter((d) => d.status === status).length;
    return {
      all: rows.length,
      active: count("active"),
      scheduled: count("scheduled"),
      expired: count("expired"),
      used_up: count("used_up"),
      inactive: count("inactive"),
    };
  },

  async create(input: DiscountInput): Promise<Discount> {
    await mockDelay();
    checkDiscount(input);
    const discount = withDerived({ ...input, code: input.code.trim().toUpperCase(), id: nextDiscountId++, used_count: 0 });
    DISCOUNTS.push(discount);
    return structuredClone(discount);
  },

  async update(id: number, input: DiscountInput): Promise<Discount> {
    await mockDelay();
    const current = findDiscount(id);
    checkDiscount(input, id);
    if (input.usage_limit !== undefined && input.usage_limit < current.used_count) {
      throw new ApiError(422, `Usage limit can't be lower than the ${current.used_count} times it has already been used.`);
    }
    const index = DISCOUNTS.indexOf(current);
    return saveDiscount(index, { ...current, ...input, code: input.code.trim().toUpperCase() });
  },

  async setActive(id: number, active: boolean): Promise<Discount> {
    await mockDelay(400);
    const current = findDiscount(id);
    return saveDiscount(DISCOUNTS.indexOf(current), { ...current, active });
  },

  async remove(id: number): Promise<void> {
    await mockDelay(400);
    const current = findDiscount(id);
    if (current.used_count > 0) {
      throw new ApiError(409, "This discount has already been used, so it can't be deleted. Deactivate it instead.");
    }
    DISCOUNTS.splice(DISCOUNTS.indexOf(current), 1);
  },

  async validate(req: DiscountValidationRequest): Promise<DiscountValidationResult> {
    await mockDelay(400);
    const found = DISCOUNTS.map((d) => withDerived(d)).find((d) => d.code === req.code.trim().toUpperCase());
    if (!found) return { valid: false, reason: "This code doesn't exist." };
    const reasons: Partial<Record<DiscountStatus, string>> = {
      inactive: "This code is not active.",
      scheduled: `This code starts on ${found.start_date}.`,
      expired: "This code has expired.",
      used_up: "This code has reached its usage limit.",
    };
    if (found.status !== "active") return { valid: false, reason: reasons[found.status]! };
    if (found.min_purchase && req.subtotal < found.min_purchase) {
      return { valid: false, reason: `Needs a minimum purchase of ₹${found.min_purchase}.` };
    }
    if (found.min_quantity && req.quantity < found.min_quantity) {
      return { valid: false, reason: `Needs at least ${found.min_quantity} seats/units.` };
    }
    if (found.applies_to === "products" && !found.product_ids.some((id) => req.product_ids.includes(id))) {
      return { valid: false, reason: `Only applies to: ${found.product_names.join(", ")}.` };
    }
    const { id, code, name, type, value, applies_to, product_ids } = found;
    return { valid: true, discount: { id, code, name, type, value, applies_to, product_ids } };
  },
};

// --- Taxes -----------------------------------------------------------------------

let nextTaxId = 1;
const TAX_SEED: TaxInput[] = [
  { name: "GST 18%", type: "percentage", rate: 18, applies_to: "all", product_ids: [], is_default: true, active: true },
  { name: "GST 12%", type: "percentage", rate: 12, applies_to: "products", product_ids: [3], is_default: false, active: true },
  { name: "GST 5%", type: "percentage", rate: 5, applies_to: "products", product_ids: [5], is_default: false, active: false },
  { name: "Digital services cess", type: "fixed", rate: 25, applies_to: "products", product_ids: [2], is_default: false, active: true },
];
const TAXES: TaxRule[] = TAX_SEED.map((t) => ({ ...t, id: nextTaxId++, product_names: productNames(t.product_ids) }));

function findTax(id: number): TaxRule {
  const tax = TAXES.find((t) => t.id === id);
  if (!tax) throw new ApiError(404, "Tax rule not found.");
  return tax;
}

function checkTax(input: TaxInput, ignoreId?: number) {
  if (TAXES.some((t) => t.name.toLowerCase() === input.name.trim().toLowerCase() && t.id !== ignoreId)) {
    throw new ApiError(409, `A tax rule called "${input.name.trim()}" already exists.`);
  }
  if (input.type === "percentage" && input.rate > 100) throw new ApiError(422, "A percentage can't be more than 100.");
  if (input.applies_to === "products" && input.product_ids.length === 0) throw new ApiError(422, "Choose at least one product.");
  if (input.is_default && !input.active) throw new ApiError(422, "The default tax must be active.");
}

/** Keeps exactly one default: making one default clears the others. */
function applyDefault(id: number) {
  TAXES.forEach((t) => (t.is_default = t.id === id));
}

export const mockTaxes = {
  async list(): Promise<TaxRule[]> {
    await mockDelay();
    return structuredClone([...TAXES].sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name)));
  },

  async create(input: TaxInput): Promise<TaxRule> {
    await mockDelay();
    checkTax(input);
    const tax: TaxRule = { ...input, name: input.name.trim(), id: nextTaxId++, product_names: productNames(input.product_ids) };
    TAXES.push(tax);
    if (tax.is_default) applyDefault(tax.id);
    return structuredClone(tax);
  },

  async update(id: number, input: TaxInput): Promise<TaxRule> {
    await mockDelay();
    const current = findTax(id);
    checkTax(input, id);
    if (current.is_default && !input.is_default) {
      throw new ApiError(422, "Make another tax the default first — there must always be one.");
    }
    Object.assign(current, input, { name: input.name.trim(), product_names: productNames(input.product_ids) });
    if (current.is_default) applyDefault(current.id);
    return structuredClone(current);
  },

  async setDefault(id: number): Promise<TaxRule> {
    await mockDelay(400);
    const tax = findTax(id);
    if (!tax.active) throw new ApiError(422, "Activate this tax before making it the default.");
    applyDefault(id);
    return structuredClone(tax);
  },

  async setActive(id: number, active: boolean): Promise<TaxRule> {
    await mockDelay(400);
    const tax = findTax(id);
    if (!active && tax.is_default) throw new ApiError(422, "The default tax can't be deactivated. Make another tax the default first.");
    tax.active = active;
    return structuredClone(tax);
  },

  async remove(id: number): Promise<void> {
    await mockDelay(400);
    const tax = findTax(id);
    if (tax.is_default) throw new ApiError(409, "The default tax can't be deleted. Make another tax the default first.");
    TAXES.splice(TAXES.indexOf(tax), 1);
  },
};

export const mockLookups = {
  async products(): Promise<ProductOption[]> {
    await mockDelay(200);
    return structuredClone(PRODUCTS);
  },
};
