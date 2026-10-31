import { api, toApiError, USE_MOCKS } from "@/services/api";
import { mockProducts } from "@/mocks/products";
import type { Paginated } from "@/types/common";
import type { Product, ProductCreate, ProductDetail, ProductListQuery, ProductVariant, ProductVariantCreate, ProductVariantUpdate } from "@/types/product";

// Product routes and schemas are implemented in the backend; Member 1 APIs remain mock-backed
// when VITE_USE_MOCKS=true, as documented in BACKEND_INTEGRATION.md.
export const productService = {
  async list(params: ProductListQuery): Promise<Paginated<Product>> {
    if (USE_MOCKS) return mockProducts.list(params);
    try { return (await api.get<Paginated<Product>>("/api/products", { params })).data; }
    catch (error) { throw toApiError(error); }
  },
  async getById(id: string | number): Promise<ProductDetail> {
    if (USE_MOCKS) return mockProducts.getById(id);
    try { return (await api.get<ProductDetail>(`/api/products/${id}`)).data; }
    catch (error) { throw toApiError(error); }
  },
  async create(data: ProductCreate): Promise<Product> {
    if (USE_MOCKS) return mockProducts.create(data);
    try { return (await api.post<Product>("/api/products", data)).data; }
    catch (error) { throw toApiError(error); }
  },
  async update(id: string | number, data: Partial<ProductCreate>): Promise<Product> {
    if (USE_MOCKS) return mockProducts.update(id, data);
    try { return (await api.put<Product>(`/api/products/${id}`, data)).data; }
    catch (error) { throw toApiError(error); }
  },
  async listVariants(id: string | number): Promise<ProductVariant[]> {
    if (USE_MOCKS) return mockProducts.listVariants(id);
    const product = await this.getById(id);
    return product.attributes.flatMap((attribute) => attribute.values);
  },
  async createVariant(productId: string | number, data: ProductVariantCreate): Promise<ProductVariant> {
    if (USE_MOCKS) return mockProducts.createVariant(productId, data);
    try {
      const { data: attribute } = await api.post<{ id: string | number; name: string; product_id: string | number; values: ProductVariant[] }>(`/api/products/${productId}/attributes`, { name: data.attribute_name, values: [{ value: data.value, extra_price: data.extra_price }] });
      const created = attribute.values?.find((value) => value.value === data.value);
      if (!created) throw new Error("The product attribute response did not include its new value.");
      return { ...created, attribute_id: attribute.id, attribute_name: attribute.name };
    } catch (error) { throw toApiError(error); }
  },
  async updateVariant(id: string | number, data: ProductVariantUpdate): Promise<ProductVariant> {
    if (USE_MOCKS) return mockProducts.updateVariant(id, data);
    try { return (await api.put<ProductVariant>(`/api/product-attribute-values/${id}`, data)).data; }
    catch (error) { throw toApiError(error); }
  },
  async removeVariant(id: string | number): Promise<void> {
    if (USE_MOCKS) return mockProducts.removeVariant(id);
    try { await api.delete(`/api/product-attribute-values/${id}`); }
    catch (error) { throw toApiError(error); }
  },
};
