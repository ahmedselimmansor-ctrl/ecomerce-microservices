'use client';

import { z } from 'zod';
import { api, type RequestOptions } from './api';
import { useAuth } from '@/store/auth';

/* ========================================================================== */
/*  مخططات لوحة التحكم                                                         */
/* ========================================================================== */

export const adminProductSchema = z.object({
  id: z.string().nullable().optional(),
  sku: z.string(),
  slug: z.string().nullable().optional(),
  title: z.record(z.string()).default({}),
  description: z.record(z.string()).default({}),
  brandId: z.string().nullable().optional(),
  brandName: z.string().nullable().optional(),
  categoryPath: z.array(z.string()).default([]),
  currency: z.string().default('EGP'),
  priceMinor: z.number().int(),
  wasMinor: z.number().int().nullable().optional(),
  discountPercent: z.number().int().nullable().optional(),
  images: z.array(z.string()).default([]),
  attributes: z.record(z.unknown()).default({}),
  tags: z.array(z.string()).default([]),
  rating: z.number().nullable().optional(),
  ratingCount: z.number().int().nullable().optional(),
  sellerId: z.string().nullable().optional(),
  status: z.string(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
});

export type AdminProduct = z.infer<typeof adminProductSchema>;

export const adminOrderSummarySchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  userId: z.string(),
  status: z.string(),
  currency: z.string(),
  totalMinor: z.number().int(),
  itemCount: z.number().int(),
  paymentMethod: z.string(),
  failureReason: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type AdminOrderSummary = z.infer<typeof adminOrderSummarySchema>;

export const stockRowSchema = z.object({
  sku: z.string(),
  warehouseId: z.string(),
  onHand: z.number().int(),
  reserved: z.number().int(),
  available: z.number().int(),
  version: z.number().int(),
  updatedAt: z.string(),
});

export type StockRow = z.infer<typeof stockRowSchema>;

export const pagedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int(),
    size: z.number().int(),
    totalItems: z.number().int(),
    totalPages: z.number().int(),
    hasNext: z.boolean(),
  });

export const dashboardSchema = z.object({
  catalog: z
    .object({
      total: z.number(), active: z.number(), inactive: z.number(),
      archived: z.number(), brands: z.number(),
    })
    .nullable(),
  orders: z
    .object({
      totalOrders: z.number(), pending: z.number(), confirmed: z.number(),
      processing: z.number(), shipped: z.number(), delivered: z.number(),
      cancelled: z.number(), revenueMinor: z.number(), todayOrders: z.number(),
      todayRevenueMinor: z.number(), averageOrderMinor: z.number(),
    })
    .nullable(),
  inventory: z
    .object({
      skus: z.number(), totalOnHand: z.number(), totalReserved: z.number(),
      lowStock: z.number(), outOfStock: z.number(),
    })
    .nullable(),
});

export type Dashboard = z.infer<typeof dashboardSchema>;

/* ========================================================================== */
/*  عميل مُصادَق                                                               */
/* ========================================================================== */

/**
 * كل نداء إداري يجدّد التوكن أولًا.
 *
 * <p>جلسة لوحة التحكم تبقى مفتوحة ساعات، وتوكن الوصول عمره 15 دقيقة.
 * التجديد قبل كل نداء أبسط وأمتن من معالجة 401 بعد وقوعه في عشرات الأماكن.
 */
async function authed<S extends z.ZodTypeAny>(
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string,
  schema: S,
  body?: unknown,
  opts?: RequestOptions,
): Promise<z.output<S>> {
  const token = await useAuth.getState().getValidToken();
  if (!token) {
    throw new Error('UNAUTHENTICATED');
  }
  const options = { ...opts, token };

  if (method === 'get') return api.get(path, schema, options);
  if (method === 'delete') return api.delete(path, schema, options);
  return api[method](path, schema, body, options);
}

export const adminApi = {
  dashboard: () => authed('get', '/api/v1/admin/dashboard', dashboardSchema),

  // ---------------------------------------------------------------- products

  listProducts: (params: URLSearchParams) =>
    authed('get', `/api/v1/admin/products?${params}`, pagedSchema(adminProductSchema)),

  getProduct: (sku: string) =>
    authed('get', `/api/v1/admin/products/${encodeURIComponent(sku)}`, adminProductSchema),

  saveProduct: (payload: unknown) =>
    authed('put', '/api/v1/admin/products', z.unknown(), payload),

  setProductStatus: (sku: string, status: string) =>
    authed('patch', `/api/v1/admin/products/${encodeURIComponent(sku)}/status`,
      adminProductSchema, { status }),

  archiveProduct: (sku: string) =>
    authed('delete', `/api/v1/admin/products/${encodeURIComponent(sku)}`, z.unknown()),

  // ------------------------------------------------------------------ orders

  listOrders: (params: URLSearchParams) =>
    authed('get', `/api/v1/admin/orders?${params}`, pagedSchema(adminOrderSummarySchema)),

  getOrder: (orderId: string) =>
    authed('get', `/api/v1/admin/orders/${orderId}`, z.unknown()),

  setOrderStatus: (orderId: string, status: string) =>
    authed('put', `/api/v1/admin/orders/${orderId}/status`, z.unknown(), { status }),

  cancelOrder: (orderId: string, reason: string) =>
    authed('post', `/api/v1/admin/orders/${orderId}/cancel`, z.unknown(), { reason }),

  // --------------------------------------------------------------- inventory

  listStock: (params: URLSearchParams) =>
    authed('get', `/api/v1/admin/inventory/stock?${params}`, pagedSchema(stockRowSchema)),

  saveStock: (sku: string, onHand: number, warehouseId = 'DXB-1') =>
    authed('put', '/api/v1/admin/inventory/stock', stockRowSchema, { sku, onHand, warehouseId }),

  restock: (sku: string, quantity: number) =>
    authed('post', `/api/v1/admin/inventory/${encodeURIComponent(sku)}/restock`,
      z.unknown(), { quantity }),
};
