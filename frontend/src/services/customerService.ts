import { api, toApiError, USE_MOCKS } from "@/services/api";
import { mockCustomers } from "@/mocks/customers";
import type { Customer, CustomerDetail, CustomerCreate, CustomerUpdate, CustomerListQuery } from "@/types/customer";
import type { Paginated } from "@/types/common";

// Endpoints are documented in docs/api-contracts.md.

export const customerService = {
  /** GET /api/customers — paginated, searchable, filterable list. */
  async list(params: CustomerListQuery): Promise<Paginated<Customer>> {
    if (USE_MOCKS) return mockCustomers.list(params);
    try {
      return (await api.get<Paginated<Customer>>("/api/customers", { params })).data;
    } catch (e) {
      throw toApiError(e);
    }
  },

  /** GET /api/customers/:id — full customer record including stats. */
  async getById(id: number): Promise<CustomerDetail> {
    if (USE_MOCKS) return mockCustomers.getById(id);
    try {
      return (await api.get<CustomerDetail>(`/api/customers/${id}`)).data;
    } catch (e) {
      throw toApiError(e);
    }
  },

  /** POST /api/customers — create a new customer. */
  async create(data: CustomerCreate): Promise<Customer> {
    if (USE_MOCKS) return mockCustomers.create(data);
    try {
      return (await api.post<Customer>("/api/customers", data)).data;
    } catch (e) {
      throw toApiError(e);
    }
  },

  /** PUT /api/customers/:id — update an existing customer. */
  async update(id: number, data: CustomerUpdate): Promise<Customer> {
    if (USE_MOCKS) return mockCustomers.update(id, data);
    try {
      return (await api.put<Customer>(`/api/customers/${id}`, data)).data;
    } catch (e) {
      throw toApiError(e);
    }
  },

  /** POST /api/customers/:id/invite — send a portal invitation. */
  async inviteToPortal(id: number): Promise<{ message: string }> {
    if (USE_MOCKS) return mockCustomers.inviteToPortal(id);
    try {
      return (await api.post<{ message: string }>(`/api/customers/${id}/invite`)).data;
    } catch (e) {
      throw toApiError(e);
    }
  },
};
