import type { ListQuery } from "@/types/common";

export type ProductType = "service" | "software" | "add_on" | "physical";
export type ProductStatus = "active" | "archived";

/** Product fields backed by backend/app/models/product.py. */
export interface Product {
  id: string | number;
  name: string;
  description?: string | null;
  product_type: ProductType;
  sales_price: number;
  cost_price?: number | null;
  status: ProductStatus;
  created_at?: string;
  updated_at?: string;
  /** Optional API aggregates used by the product list. */
  variants_count?: number;
  plans_count?: number;
}

/** A value under a product attribute (the backend's variant representation). */
export interface ProductVariant {
  id: string | number;
  attribute_id: string | number;
  attribute_name: string;
  value: string;
  extra_price: number;
}

export interface ProductAttribute {
  id: string | number;
  product_id: string | number;
  name: string;
  values: ProductVariant[];
}

export interface ProductDetail extends Product {
  attributes: ProductAttribute[];
}

export interface ProductCreate {
  name: string;
  description?: string;
  product_type: ProductType;
  sales_price: number;
  cost_price?: number;
  status: ProductStatus;
}

export type ProductUpdate = Partial<ProductCreate>;
export interface ProductListQuery extends ListQuery {
  product_type?: ProductType;
  status?: ProductStatus;
}

export interface ProductVariantCreate {
  attribute_name: string;
  value: string;
  extra_price: number;
}

export interface ProductVariantUpdate {
  value?: string;
  extra_price?: number;
}
