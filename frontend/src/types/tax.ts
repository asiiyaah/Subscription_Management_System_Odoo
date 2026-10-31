export type TaxType = "percentage" | "fixed";

/** Admin-defined tax rule; the backend applies it to subscription and invoice lines (R23). */
export interface TaxRule {
  id: number;
  /** Shown on invoice lines, e.g. "GST 18%". */
  name: string;
  type: TaxType;
  /** Percent for "percentage", ₹ per unit for "fixed". */
  rate: number;
  /** All products, or only these products. */
  applies_to: "all" | "products";
  product_ids: number[];
  product_names: string[];
  /** The default rule is used for products that no other rule covers. Exactly one default. */
  is_default: boolean;
  active: boolean;
}

/** Body for POST /api/taxes and PUT /api/taxes/{id}. */
export type TaxInput = Omit<TaxRule, "id" | "product_names">;
