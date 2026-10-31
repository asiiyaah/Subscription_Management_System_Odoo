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
