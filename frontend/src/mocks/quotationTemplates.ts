import { ApiError } from "@/services/api";
import { mockDelay, paginate } from "@/mocks/utils";
import type { QuotationTemplate, QuotationTemplateInput, QuotationTemplateListQuery } from "@/types/quotationTemplate";

let nextId = 5;
const usedTemplateIds = new Set<string>();
const clone = <T,>(value: T): T => structuredClone(value);
let templates: QuotationTemplate[] = [
  { id: "00000000-0000-4000-8000-000000000101", name: "Pro onboarding offer", description: "Pro plan with an introductory evaluation period.", payment_terms: "Net 15", validity_days: 30, status: "active", lines: [{ id: "mock-template-line-101", product_id: "1", plan_id: "1", quantity: 1, unit_price: 2499 }] },
  { id: "00000000-0000-4000-8000-000000000102", name: "Cloud backup bundle", description: "A multi-product backup offer for growing teams.", payment_terms: "Net 30", validity_days: 21, status: "active", lines: [{ id: "mock-template-line-102a", product_id: "2", plan_id: "3", quantity: 5, unit_price: 799 }, { id: "mock-template-line-102b", product_id: "6", quantity: 5, unit_price: 299 }] },
  { id: "00000000-0000-4000-8000-000000000103", name: "Analytics pilot", description: "Short analytics rollout quotation.", payment_terms: "Due on receipt", validity_days: 14, status: "active", lines: [{ id: "mock-template-line-103", product_id: "4", plan_id: "6", quantity: 1, unit_price: 99 }] },
  { id: "00000000-0000-4000-8000-000000000104", name: "Legacy support offer", description: "An inactive template retained for reference.", payment_terms: "Net 30", validity_days: 30, status: "inactive", lines: [{ id: "mock-template-line-104", product_id: "3", plan_id: "5", quantity: 2, unit_price: 399 }] },
];

function find(id: string): QuotationTemplate {
  const template = templates.find((item) => item.id === id);
  if (!template) throw new ApiError(404, "Quotation template not found.");
  return template;
}

export function recordQuotationTemplateUsage(id: string) { usedTemplateIds.add(id); }

function validate(input: QuotationTemplateInput) {
  if (!input.name.trim() || input.name.length > 150) throw new ApiError(422, "Name must contain 1 to 150 characters.");
  if (!Number.isInteger(input.validity_days) || input.validity_days < 1 || input.validity_days > 365) throw new ApiError(422, "Validity must be between 1 and 365 days.");
  for (const line of input.lines) {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) throw new ApiError(422, "Line quantities must be greater than zero.");
    if (!Number.isFinite(line.unit_price) || line.unit_price < 0) throw new ApiError(422, "Line unit prices cannot be negative.");
  }
}

export const mockQuotationTemplates = {
  async list(query: QuotationTemplateListQuery): Promise<{ items: QuotationTemplate[]; total: number; page: number; page_size: number }> {
    await mockDelay();
    const { status, ...listQuery } = query;
    const rows = status ? templates.filter((item) => item.status === status) : templates;
    return paginate(rows, listQuery, ["name", "description", "payment_terms"]);
  },
  async get(id: string): Promise<QuotationTemplate> { await mockDelay(); return clone(find(id)); },
  async create(input: QuotationTemplateInput): Promise<QuotationTemplate> {
    await mockDelay(); validate(input);
    const template: QuotationTemplate = { ...input, id: `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`, lines: input.lines.map((line, index) => ({ ...line, id: `mock-template-line-${nextId}-${index}` })) };
    templates = [template, ...templates];
    return clone(template);
  },
  async update(id: string, input: QuotationTemplateInput): Promise<QuotationTemplate> {
    await mockDelay(); find(id); validate(input);
    const updated: QuotationTemplate = { ...input, id, lines: input.lines.map((line, index) => ({ ...line, id: `mock-template-line-${id}-${index}` })) };
    templates = templates.map((item) => item.id === id ? updated : item);
    return clone(updated);
  },
  async remove(id: string): Promise<void> {
    await mockDelay(); find(id);
    if (usedTemplateIds.has(id)) throw new ApiError(409, "A template used by subscriptions cannot be deleted.");
    templates = templates.filter((item) => item.id !== id);
  },
};
