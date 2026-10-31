import type { ListQuery, Paginated } from "@/types/common";

export type QuotationTemplateId = string;
export type QuotationTemplateStatus = string;

export interface QuotationTemplateLine {
  id?: string;
  product_id: string;
  plan_id?: string | null;
  quantity: number | string;
  unit_price: number | string;
}

/** Mirrors TemplateInput in backend/app/routers/quotation_templates.py. */
export interface QuotationTemplateInput {
  name: string;
  description?: string | null;
  payment_terms?: string | null;
  validity_days: number;
  status: string;
  lines: Array<{
    product_id: string;
    plan_id?: string | null;
    quantity: number;
    unit_price: number;
  }>;
}

/** Mirrors _dict() in backend/app/routers/quotation_templates.py. */
export interface QuotationTemplate {
  id: QuotationTemplateId;
  name: string;
  description?: string | null;
  payment_terms?: string | null;
  validity_days: number;
  status: QuotationTemplateStatus;
  lines: QuotationTemplateLine[];
}

export interface QuotationTemplateListQuery extends ListQuery {
  status?: string;
}

export type QuotationTemplatePage = Paginated<QuotationTemplate>;
