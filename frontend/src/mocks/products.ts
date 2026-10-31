import { ApiError } from "@/services/api";
import { mockDelay, paginate } from "@/mocks/utils";
import type { Paginated } from "@/types/common";
import type { Product, ProductAttribute, ProductCreate, ProductDetail, ProductListQuery, ProductVariant, ProductVariantCreate, ProductVariantUpdate } from "@/types/product";

type SeedProduct = ProductDetail & { plans_count: number };
let nextProductId = 9;
let nextAttributeId = 30;
let nextVariantId = 90;

let store: SeedProduct[] = [
  { id: 1, name: "SubscriptIQ Pro", description: "Subscription operations workspace for growing teams.", product_type: "software", sales_price: 2499, cost_price: 620, status: "active", created_at: "2025-01-10T09:00:00Z", plans_count: 3, attributes: [{ id: 1, product_id: 1, name: "Edition", values: [{ id: 1, attribute_id: 1, attribute_name: "Edition", value: "Standard", extra_price: 0 }, { id: 2, attribute_id: 1, attribute_name: "Edition", value: "Enterprise", extra_price: 1800 }] }] },
  { id: 2, name: "Cloud Backup", description: "Managed cloud backup and recovery service.", product_type: "service", sales_price: 799, cost_price: 210, status: "active", created_at: "2025-02-12T09:00:00Z", plans_count: 2, attributes: [{ id: 2, product_id: 2, name: "Storage", values: [{ id: 3, attribute_id: 2, attribute_name: "Storage", value: "100 GB", extra_price: 0 }, { id: 4, attribute_id: 2, attribute_name: "Storage", value: "1 TB", extra_price: 550 }] }] },
  { id: 3, name: "Odoo Connector", description: "Connect your subscriptions with Odoo accounting.", product_type: "add_on", sales_price: 1299, cost_price: 325, status: "active", created_at: "2025-03-01T09:00:00Z", plans_count: 1, attributes: [] },
  { id: 4, name: "Analytics Suite", description: "Business intelligence dashboards and scheduled reports.", product_type: "software", sales_price: 1899, cost_price: 410, status: "active", created_at: "2025-03-18T09:00:00Z", plans_count: 2, attributes: [{ id: 3, product_id: 4, name: "Brand", values: [{ id: 5, attribute_id: 3, attribute_name: "Brand", value: "Generic", extra_price: 0 }, { id: 6, attribute_id: 3, attribute_name: "Brand", value: "Odoo", extra_price: 560 }] }] },
  { id: 5, name: "Onboarding Service", description: "Guided setup and team onboarding sessions.", product_type: "service", sales_price: 9500, cost_price: 3400, status: "active", created_at: "2025-04-06T09:00:00Z", plans_count: 1, attributes: [] },
  { id: 6, name: "Team Seats Add-on", description: "Additional user seats for an existing subscription.", product_type: "add_on", sales_price: 299, cost_price: 60, status: "active", created_at: "2025-05-11T09:00:00Z", plans_count: 2, attributes: [] },
  { id: 7, name: "Support Desk", description: "Priority support with business-hours response targets.", product_type: "service", sales_price: 1499, cost_price: 390, status: "archived", created_at: "2024-11-20T09:00:00Z", plans_count: 0, attributes: [] },
  { id: 8, name: "Secure Key Device", description: "Optional hardware security key for account administrators.", product_type: "physical", sales_price: 1850, cost_price: 920, status: "active", created_at: "2025-06-17T09:00:00Z", plans_count: 1, attributes: [{ id: 4, product_id: 8, name: "Finish", values: [{ id: 7, attribute_id: 4, attribute_name: "Finish", value: "Graphite", extra_price: 0 }, { id: 8, attribute_id: 4, attribute_name: "Finish", value: "Silver", extra_price: 120 }] }] },
];

const clone = <T,>(value: T): T => structuredClone(value);
function findProduct(id: string | number): SeedProduct {
  const product = store.find((item) => String(item.id) === String(id));
  if (!product) throw new ApiError(404, "Product not found.");
  return product;
}
function flatten(product: SeedProduct): ProductVariant[] {
  return product.attributes.flatMap((attribute) => attribute.values);
}

export const mockProducts = {
  async list(query: ProductListQuery): Promise<Paginated<Product>> {
    await mockDelay();
    const items = store.map((p) => ({ ...p, variants_count: flatten(p).length }));
    return paginate(items, query, ["name", "description", "product_type"]);
  },
  async getById(id: string | number): Promise<ProductDetail> {
    await mockDelay();
    return clone(findProduct(id));
  },
  async create(data: ProductCreate): Promise<Product> {
    await mockDelay();
    const product: SeedProduct = { ...data, id: nextProductId++, created_at: new Date().toISOString(), plans_count: 0, attributes: [] };
    store = [...store, product];
    return clone({ ...product, variants_count: 0 });
  },
  async update(id: string | number, data: Partial<ProductCreate>): Promise<Product> {
    await mockDelay();
    findProduct(id);
    store = store.map((p) => String(p.id) === String(id) ? { ...p, ...data, updated_at: new Date().toISOString() } : p);
    const saved = findProduct(id);
    return clone({ ...saved, variants_count: flatten(saved).length });
  },
  async listVariants(id: string | number): Promise<ProductVariant[]> {
    await mockDelay();
    return clone(flatten(findProduct(id)));
  },
  async createVariant(id: string | number, data: ProductVariantCreate): Promise<ProductVariant> {
    await mockDelay();
    const product = findProduct(id);
    let attribute = product.attributes.find((item) => item.name.toLowerCase() === data.attribute_name.trim().toLowerCase());
    if (!attribute) {
      attribute = { id: nextAttributeId++, product_id: product.id, name: data.attribute_name.trim(), values: [] };
      product.attributes = [...product.attributes, attribute];
    }
    const variant: ProductVariant = { id: nextVariantId++, attribute_id: attribute.id, attribute_name: attribute.name, value: data.value.trim(), extra_price: data.extra_price };
    attribute.values = [...attribute.values, variant];
    return clone(variant);
  },
  async updateVariant(id: string | number, data: ProductVariantUpdate): Promise<ProductVariant> {
    await mockDelay();
    let saved: ProductVariant | undefined;
    store = store.map((p) => ({ ...p, attributes: p.attributes.map((a) => ({ ...a, values: a.values.map((v) => {
      if (String(v.id) !== String(id)) return v;
      saved = { ...v, ...data };
      return saved;
    }) })) }));
    if (!saved) throw new ApiError(404, "Product variant not found.");
    return clone(saved);
  },
  async removeVariant(id: string | number): Promise<void> {
    await mockDelay();
    let found = false;
    store = store.map((p) => ({ ...p, attributes: p.attributes.map((a) => ({ ...a, values: a.values.filter((v) => {
      if (String(v.id) === String(id)) { found = true; return false; }
      return true;
    }) })).filter((a) => a.values.length > 0) }));
    if (!found) throw new ApiError(404, "Product variant not found.");
  },
};

export type MockProductAttribute = ProductAttribute;
