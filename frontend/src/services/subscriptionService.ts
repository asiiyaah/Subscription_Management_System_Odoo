import { api, ApiError, toApiError, USE_MOCKS } from "@/services/api";
import { mockSubscriptions } from "@/mocks/subscriptions";
import { mockCustomers } from "@/mocks/customers";
import type { Paginated } from "@/types/common";
import type {
  Subscription, SubscriptionAction, SubscriptionCreate, SubscriptionCustomerOption,
  SubscriptionDiscountOption, SubscriptionInvoicePage, SubscriptionListQuery,
  SubscriptionPreview, SubscriptionProductDetail, SubscriptionTemplateOption, SubscriptionUpdate,
} from "@/types/subscription";

async function request<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try { return (await call()).data; }
  catch (error) { throw toApiError(error); }
}

export const subscriptionService = {
  list(query: SubscriptionListQuery): Promise<Paginated<Subscription>> {
    if (USE_MOCKS) return mockSubscriptions.list(query);
    const { page, page_size, status, customer_id } = query;
    return request(() => api.get("/api/subscriptions", { params: { page, page_size, status, customer_id } }));
  },
  get(id: string): Promise<Subscription> {
    return USE_MOCKS ? mockSubscriptions.get(id) : request(() => api.get(`/api/subscriptions/${id}`));
  },
  preview(input: SubscriptionCreate): Promise<SubscriptionPreview> {
    return USE_MOCKS ? mockSubscriptions.preview(input) : request(() => api.post("/api/subscriptions/preview", input));
  },
  create(input: SubscriptionCreate): Promise<Subscription> {
    return USE_MOCKS ? mockSubscriptions.create(input) : request(() => api.post("/api/subscriptions", input));
  },
  update(id: string, input: SubscriptionUpdate): Promise<Subscription> {
    return USE_MOCKS ? mockSubscriptions.update(id, input) : request(() => api.patch(`/api/subscriptions/${id}`, input));
  },
  action(id: string, action: SubscriptionAction): Promise<Subscription> {
    return USE_MOCKS ? mockSubscriptions.action(id, action) : request(() => api.post(`/api/subscriptions/${id}/${action}`));
  },
  async customers(search = ""): Promise<SubscriptionCustomerOption[]> {
    if (USE_MOCKS) return mockSubscriptions.customers(search);
    const result = await request<{ items: Array<{ id: string; name: string; email?: string | null; company?: string | null }> }>(
      () => api.get("/api/customers", { params: { q: search || undefined, page: 1, page_size: 100 } }),
    );
    return result.items.map(({ id, name, email, company }) => ({ id, name, email, company }));
  },
  async customer(id: string): Promise<SubscriptionCustomerOption> {
    if (USE_MOCKS) {
      const customer = await mockCustomers.getById(Number(id));
      return { id: String(customer.id), name: customer.name, email: customer.email, company: customer.company };
    }
    return request(() => api.get(`/api/customers/${id}`));
  },
  products(page = 1): Promise<Paginated<SubscriptionProductDetail>> {
    if (USE_MOCKS) return mockSubscriptions.products(page);
    return request(() => api.get("/api/products", { params: { page, page_size: 100, status: "active" } }));
  },
  product(id: string): Promise<SubscriptionProductDetail> {
    if (USE_MOCKS) return mockSubscriptions.product(id);
    return request(() => api.get(`/api/products/${id}`));
  },
  async discounts(): Promise<SubscriptionDiscountOption[]> {
    if (USE_MOCKS) return mockSubscriptions.discounts();
    const result = await request<{ items: Array<{ id: string; code?: string | null; name: string; is_active?: boolean | null }> }>(
      () => api.get("/api/discounts", { params: { active: true, page: 1, page_size: 100 } }),
    );
    return result.items.map((item) => ({ id: item.id, code: item.code, name: item.name, active: Boolean(item.is_active) }));
  },
  async templates(): Promise<SubscriptionTemplateOption[]> {
    if (USE_MOCKS) return mockSubscriptions.templates();
    const result = await request<{ items: SubscriptionTemplateOption[] }>(
      () => api.get("/api/quotation-templates", { params: { page: 1, page_size: 100 } }),
    );
    return result.items.filter((item) => item.status === "active");
  },
  invoices(id: string): Promise<SubscriptionInvoicePage> {
    if (USE_MOCKS) return mockSubscriptions.invoices(id);
    // The backend invoice router currently ignores subscription_id; do not return an unfiltered invoice list.
    return Promise.reject(new ApiError(501, "Subscription invoice filtering is not implemented by the current backend API."));
  },
};
