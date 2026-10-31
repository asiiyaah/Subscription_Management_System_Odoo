import { api, toApiError, USE_MOCKS } from "@/services/api";
import { mockQuotationTemplates } from "@/mocks/quotationTemplates";
import type { QuotationTemplate, QuotationTemplateInput, QuotationTemplateListQuery, QuotationTemplatePage } from "@/types/quotationTemplate";

export const quotationTemplateService = {
  async list(query: QuotationTemplateListQuery): Promise<QuotationTemplatePage> {
    if (USE_MOCKS) return mockQuotationTemplates.list(query);
    const { page, page_size, search } = query;
    try { return (await api.get<QuotationTemplatePage>("/api/quotation-templates", { params: { page, page_size, q: search } })).data; }
    catch (error) { throw toApiError(error); }
  },
  async get(id: string): Promise<QuotationTemplate> {
    if (USE_MOCKS) return mockQuotationTemplates.get(id);
    try { return (await api.get<QuotationTemplate>(`/api/quotation-templates/${id}`)).data; }
    catch (error) { throw toApiError(error); }
  },
  async create(input: QuotationTemplateInput): Promise<QuotationTemplate> {
    if (USE_MOCKS) return mockQuotationTemplates.create(input);
    try { return (await api.post<QuotationTemplate>("/api/quotation-templates", input)).data; }
    catch (error) { throw toApiError(error); }
  },
  async update(id: string, input: QuotationTemplateInput): Promise<QuotationTemplate> {
    if (USE_MOCKS) return mockQuotationTemplates.update(id, input);
    try { return (await api.put<QuotationTemplate>(`/api/quotation-templates/${id}`, input)).data; }
    catch (error) { throw toApiError(error); }
  },
  async remove(id: string): Promise<void> {
    if (USE_MOCKS) return mockQuotationTemplates.remove(id);
    try { await api.delete(`/api/quotation-templates/${id}`); }
    catch (error) { throw toApiError(error); }
  },
};
