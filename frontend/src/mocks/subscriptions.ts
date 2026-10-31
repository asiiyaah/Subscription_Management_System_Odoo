import { ApiError } from "@/services/api";
import { mockCustomers } from "@/mocks/customers";
import { mockProducts } from "@/mocks/products";
import { mockPlans } from "@/mocks/plans";
import { mockDiscounts } from "@/mocks/pricing";
import { mockDelay, paginate } from "@/mocks/utils";
import type { Paginated } from "@/types/common";
import type {
  Subscription, SubscriptionAction, SubscriptionCreate, SubscriptionCustomerOption,
  SubscriptionDiscountOption, SubscriptionInvoicePage,
  SubscriptionListQuery, SubscriptionPreview, SubscriptionProductDetail,
  SubscriptionTemplateOption, SubscriptionUpdate,
} from "@/types/subscription";

const today = () => new Date().toISOString().slice(0, 10);
let nextId = 20;
const uuid = () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`;
const initialStatuses = ["active", "draft", "quotation", "confirmed", "paused", "closed"] as const;
let rows: Subscription[] = Array.from({ length: 12 }, (_, index) => {
  const id = index + 1;
  const customerId = (index % 8) + 1;
  const productId = (index % 6) + 1;
  const planId = [1, 3, 5, 6, 7, 8][productId - 1];
  const status = initialStatuses[index % initialStatuses.length];
  const number = `SUB-${String(id).padStart(4, "0")}`;
  return {
    id: `00000000-0000-4000-9000-${String(id).padStart(12, "0")}`,
    subscription_number: number,
    customer_id: String(customerId),
    customer_name: ["Acme Retail", "Nova Labs", "Pixel Studio", "Green Grocers", "Urban Fitness", "Zen Clinic", "Bluefin Logistics", "Kochi Coffee Co."][index % 8],
    customer_email: `billing${customerId}@example.com`,
    status,
    start_date: new Date(Date.now() - index * 14 * 86_400_000).toISOString().slice(0, 10),
    end_date: status === "closed" ? today() : null,
    next_billing_date: status === "active" ? new Date(Date.now() + (index + 1) * 86_400_000).toISOString().slice(0, 10) : null,
    quotation_valid_until: status === "quotation" ? new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10) : null,
    billing_period: ["monthly", "yearly", "monthly", "weekly"][index % 4],
    billing_interval: 1,
    subtotal: 999 + index * 125,
    discount_total: index % 3 === 0 ? 99 : 0,
    tax_total: 180 + index * 22.5,
    total: 1080 + index * 147.5,
    notes: index % 2 ? "Created from the demo account." : null,
    lines: [{ id: `mock-line-${id}`, product_id: String(productId), plan_id: String(planId), product_attribute_value_id: productId === 4 ? "6" : null, product_name: ["SubscriptIQ Pro", "Cloud Backup", "Odoo Connector", "Analytics Suite", "Onboarding Service", "Team Seats Add-on"][productId - 1], plan_name: ["Pro Monthly", "Pro Annual", "Backup 100 GB", "Backup Annual", "Connector Weekly", "Analytics Daily", "Guided Onboarding", "Extra Seats Monthly"][planId - 1], variant_name: productId === 4 ? "Brand: Odoo" : undefined, description: "Subscription product", quantity: index % 5 + 1, unit_price: 999 + index * 125, discount_amount: index % 3 === 0 ? 99 : 0, tax_amount: 180 + index * 22.5, line_total: 1080 + index * 147.5 }],
    history: [{ previous_status: null, new_status: status, action: "created", created_at: new Date(Date.now() - index * 86_400_000).toISOString() }],
  };
});

const templates: SubscriptionTemplateOption[] = [
  { id: "00000000-0000-4000-8000-000000000101", name: "Pro onboarding offer", description: "Pro plan with a short evaluation period.", payment_terms: "Net 15", validity_days: 30, status: "active", lines: [{ product_id: "1", plan_id: "1", quantity: 1 }] },
  { id: "00000000-0000-4000-8000-000000000102", name: "Team backup package", payment_terms: "Net 30", validity_days: 21, status: "active", lines: [{ product_id: "2", plan_id: "3", quantity: 5 }, { product_id: "6", plan_id: "8", quantity: 5 }] },
];

async function productDetail(id: string): Promise<SubscriptionProductDetail> {
  const product = await mockProducts.getById(id);
  return { id: String(product.id), name: product.name, product_type: product.product_type, sales_price: product.sales_price, status: product.status, attributes: product.attributes.map((attr) => ({ id: String(attr.id), name: attr.name, values: attr.values.map((value) => ({ id: String(value.id), value: value.value, extra_price: value.extra_price })) })) };
}

async function price(input: SubscriptionCreate): Promise<SubscriptionPreview> {
  const pricedLines = [];
  for (const line of input.lines) {
    const product = await mockProducts.getById(line.product_id);
    const plan = line.plan_id ? await mockPlans.getById(line.plan_id) : undefined;
    if (plan && String(plan.product_id) !== String(line.product_id)) throw new ApiError(422, "Plan must belong to the selected product.");
    const variant = line.product_attribute_value_id ? product.attributes.flatMap((attr) => attr.values).find((v) => String(v.id) === line.product_attribute_value_id) : undefined;
    if (line.product_attribute_value_id && !variant) throw new ApiError(422, "Variant does not belong to the selected product.");
    const quantity = Number(line.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new ApiError(422, "Quantity must be greater than zero.");
    if (plan && quantity < (plan.minimum_quantity ?? 1)) throw new ApiError(422, `Quantity for plan ${plan.name} must be at least ${plan.minimum_quantity}.`);
    const unit = Number(plan?.price ?? product.sales_price) + Number(variant?.extra_price ?? 0);
    pricedLines.push({ quantity, unit_price: unit, subtotal: unit * quantity });
  }
  const subtotal = pricedLines.reduce((sum, line) => sum + line.subtotal, 0);
  let discountAmount = 0;
  let eligible = pricedLines.map(() => true);
  if (input.discount_id) {
    const discounts = await mockDiscounts.list({ page: 1, page_size: 100 });
    const discount = discounts.items.find((item) => String(item.id) === input.discount_id);
    if (!discount || discount.status !== "active") throw new ApiError(422, "Discount is unavailable or expired.");
    if (discount.applies_to === "products") eligible = input.lines.map((line) => discount.product_ids.map(String).includes(line.product_id));
    const eligibleSubtotal = pricedLines.reduce((sum, line, i) => sum + (eligible[i] ? line.subtotal : 0), 0);
    const quantity = input.lines.reduce((sum, line) => sum + Number(line.quantity), 0);
    if (discount.min_quantity && quantity < discount.min_quantity) throw new ApiError(422, "Discount minimum quantity requirement not met.");
    if (discount.min_purchase && eligibleSubtotal < discount.min_purchase) throw new ApiError(422, "Discount minimum purchase requirement not met.");
    discountAmount = discount.type === "percentage" ? eligibleSubtotal * discount.value / 100 : Math.min(eligibleSubtotal, discount.value);
  }
  discountAmount = Math.round((discountAmount + Number.EPSILON) * 100) / 100;
  let remainingDiscount = discountAmount;
  const lines = pricedLines.map((line, index) => {
    const discount = eligible[index] && subtotal > 0 ? Math.round((discountAmount * line.subtotal / subtotal + Number.EPSILON) * 100) / 100 : 0;
    remainingDiscount -= discount;
    const tax = Math.round(Math.max(0, line.subtotal - discount) * 0.18 * 100) / 100;
    return { ...line, discount, tax, total: Math.round((line.subtotal - discount + tax + Number.EPSILON) * 100) / 100 };
  });
  if (lines.length && Math.abs(remainingDiscount) >= 0.01) lines[0].discount = Math.round((lines[0].discount + remainingDiscount) * 100) / 100;
  const taxTotal = lines.reduce((sum, line) => sum + line.tax, 0);
  return { subtotal, discount_total: discountAmount, tax_total: taxTotal, total: Math.round((subtotal - discountAmount + taxTotal) * 100) / 100, lines };
}

function find(id: string): Subscription {
  const value = rows.find((item) => item.id === id);
  if (!value) throw new ApiError(404, "Subscription not found.");
  return value;
}
const clone = <T,>(value: T): T => structuredClone(value);

export const mockSubscriptions = {
  async list(query: SubscriptionListQuery): Promise<Paginated<Subscription>> {
    await mockDelay();
    return paginate(rows, query, ["subscription_number", "customer_name", "status"]);
  },
  async get(id: string): Promise<Subscription> { await mockDelay(); return clone(find(id)); },
  async preview(input: SubscriptionCreate): Promise<SubscriptionPreview> { await mockDelay(300); return price(input); },
  async create(input: SubscriptionCreate): Promise<Subscription> {
    await mockDelay();
    if (!input.lines.length) throw new ApiError(422, "Add at least one product line.");
    if (!["draft", "quotation"].includes(input.status)) throw new ApiError(422, "New subscriptions must start in draft or quotation status.");
    const customer = await mockCustomers.getById(Number(input.customer_id));
    const preview = await price(input);
    const firstPlan = input.lines.find((line) => line.plan_id)?.plan_id;
    const plan = firstPlan ? await mockPlans.getById(firstPlan) : undefined;
    const value: Subscription = {
      id: uuid(), subscription_number: `SUB-${String(nextId - 1).padStart(4, "0")}`, customer_id: input.customer_id,
      customer_name: customer.name, customer_email: customer.email, status: input.status, start_date: input.start_date ?? null,
      end_date: input.end_date ?? null, quotation_valid_until: input.quotation_valid_until ?? null,
      quotation_template_id: input.quotation_template_id ?? null, billing_period: plan?.billing_period ?? "monthly",
      billing_interval: plan?.billing_interval ?? 1, subtotal: preview.subtotal, discount_total: preview.discount_total,
      tax_total: preview.tax_total, total: preview.total, notes: input.notes ?? null,
      lines: input.lines.map((line, index) => ({ id: `mock-line-${nextId}-${index}`, product_id: line.product_id, plan_id: line.plan_id ?? null,
        product_attribute_value_id: line.product_attribute_value_id ?? null, product_name: line.product_id, plan_name: line.plan_id,
        quantity: preview.lines[index].quantity, unit_price: preview.lines[index].unit_price,
        discount_amount: preview.lines[index].discount, tax_amount: preview.lines[index].tax, line_total: preview.lines[index].total })),
      history: [{ previous_status: null, new_status: input.status, action: "created", created_at: new Date().toISOString() }],
    };
    rows = [value, ...rows];
    return clone(value);
  },
  async update(id: string, changes: SubscriptionUpdate): Promise<Subscription> {
    await mockDelay();
    const current = find(id);
    if (!["draft", "quotation"].includes(current.status)) throw new ApiError(409, "Only draft or quotation subscriptions can be edited.");
    if (changes.start_date && changes.end_date && changes.end_date < changes.start_date) throw new ApiError(422, "End date must be on or after the start date.");
    rows = rows.map((row) => row.id === id ? { ...row, ...changes, updated_at: new Date().toISOString() } : row);
    return clone(find(id));
  },
  async action(id: string, action: SubscriptionAction): Promise<Subscription> {
    await mockDelay(350);
    const current = find(id);
    const transitions: Record<string, string[]> = { draft: ["confirm", "close"], quotation: ["confirm", "close"], confirmed: ["activate", "close"], active: ["pause", "renew", "close"], paused: ["resume", "close"], closed: [] };
    if (action === "renew" && ["active", "closed"].includes(current.status)) {
      const plans = await Promise.all(current.lines.filter((line) => line.plan_id).map((line) => mockPlans.getById(line.plan_id!)));
      if (plans.some((plan) => !plan.is_renewable)) throw new ApiError(409, "The selected plan does not allow renewal.");
      const updated = { ...current, status: "active" as const, start_date: current.status === "closed" ? today() : current.start_date, end_date: null };
      rows = rows.map((row) => row.id === id ? { ...updated, history: [...(row.history ?? []), { previous_status: row.status, new_status: "active", action, created_at: new Date().toISOString() }] } : row);
      return clone(find(id));
    }
    if (!transitions[current.status]?.includes(action)) throw new ApiError(409, `Cannot ${action} a ${current.status} subscription.`);
    const linkedPlans = await Promise.all(current.lines.filter((line) => line.plan_id).map((line) => mockPlans.getById(line.plan_id!)));
    if (action === "pause" && linkedPlans.some((plan) => !plan.is_pausable)) throw new ApiError(409, "The selected plan does not allow pausing.");
    if (action === "resume" && linkedPlans.some((plan) => !plan.is_renewable)) throw new ApiError(409, "The selected plan does not allow resuming.");
    if (action === "close" && linkedPlans.some((plan) => !plan.allows_early_closure) && (!current.end_date || current.end_date > today())) throw new ApiError(409, "The selected plan does not allow early closure.");
    if (action === "confirm" && current.quotation_valid_until && current.quotation_valid_until < today()) throw new ApiError(409, "Quotation has expired.");
    const target = ({ confirm: "confirmed", activate: "active", pause: "paused", resume: "active", close: "closed" } as const)[action as Exclude<SubscriptionAction, "renew">];
    const patch: Partial<Subscription> = { status: target };
    if (action === "close") patch.end_date = today();
    if (action === "activate") patch.start_date ??= today();
    rows = rows.map((row) => row.id === id ? { ...row, ...patch, history: [...(row.history ?? []), { previous_status: row.status, new_status: target, action, created_at: new Date().toISOString() }] } : row);
    return clone(find(id));
  },
  async customers(search = ""): Promise<SubscriptionCustomerOption[]> {
    const result = await mockCustomers.list({ page: 1, page_size: 100, search });
    return result.items.map((item) => ({ id: String(item.id), name: item.name, email: item.email, company: item.company }));
  },
  async products(page = 1): Promise<Paginated<SubscriptionProductDetail>> {
    const result = await mockProducts.list({ page, page_size: 100, status: "active" });
    const items = await Promise.all(result.items.map((item) => productDetail(String(item.id))));
    return { ...result, items };
  },
  async product(id: string): Promise<SubscriptionProductDetail> { await mockDelay(180); return productDetail(id); },
  async discounts(): Promise<SubscriptionDiscountOption[]> {
    const result = await mockDiscounts.list({ page: 1, page_size: 100 });
    return result.items.filter((item) => item.status === "active").map((item) => ({ id: String(item.id), code: item.code, name: item.name, active: item.active, status: item.status }));
  },
  async templates(): Promise<SubscriptionTemplateOption[]> { await mockDelay(250); return clone(templates.filter((item) => item.status === "active")); },
  async invoices(_id: string): Promise<SubscriptionInvoicePage> { await mockDelay(150); return { items: [], total: 0, page: 1, page_size: 5 }; },
};
