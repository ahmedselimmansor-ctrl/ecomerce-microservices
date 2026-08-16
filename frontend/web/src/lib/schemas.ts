import { z } from 'zod';

/**
 * مخططات Zod لكل ما يعبر حدود الشبكة.
 *
 * <p>السبب ليس شكليًا: الواجهة تتكلم مع 10 خدمات تُنشر بشكل مستقل. تغيير
 * حقل في خدمة خلفية دون تحديث الواجهة يجب أن ينتج خطأ واضحًا عند حدود
 * البيانات، لا انهيارًا غامضًا داخل مكوّن React.
 */

// ------------------------------------------------------------------ catalog

export const productSummarySchema = z.object({
  sku: z.string(),
  slug: z.string().nullable().optional(),
  title: z.string(),
  brandName: z.string().nullable().optional(),
  currency: z.string().default('EGP'),
  priceMinor: z.number().int().nonnegative(),
  wasMinor: z.number().int().nullable().optional(),
  discountPercent: z.number().int().nullable().optional(),
  image: z.string().nullable().optional(),
  rating: z.number().nullable().optional(),
  ratingCount: z.number().int().nullable().optional(),
  tags: z.array(z.string()).default([]),
});

export type ProductSummary = z.infer<typeof productSummarySchema>;

export const variantSchema = z.object({
  sku: z.string(),
  attributes: z.record(z.unknown()).default({}),
  priceMinor: z.number().int(),
  images: z.array(z.string()).default([]),
});

export const productSchema = z.object({
  id: z.string(),
  sku: z.string(),
  slug: z.string().nullable().optional(),
  title: z.string(),
  description: z.string().nullable().optional(),
  brandId: z.string().nullable().optional(),
  brandName: z.string().nullable().optional(),
  categoryPath: z.array(z.string()).default([]),
  currency: z.string().default('EGP'),
  priceMinor: z.number().int().nonnegative(),
  wasMinor: z.number().int().nullable().optional(),
  discountPercent: z.number().int().nullable().optional(),
  images: z.array(z.string()).default([]),
  attributes: z.record(z.unknown()).default({}),
  variants: z.array(variantSchema).default([]),
  rating: z.number().nullable().optional(),
  ratingCount: z.number().int().nullable().optional(),
  tags: z.array(z.string()).default([]),
  sellerId: z.string().nullable().optional(),
});

export type Product = z.infer<typeof productSchema>;

// النوع الثالث `unknown` مقصود: `.default()` يجعل نوع الدخل مختلفًا عن الخرج،
// فلا يصح تقييد الاثنين بنفس النوع في مخطط تكراري.
export const categorySchema: z.ZodType<Category, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    slug: z.string(),
    name: z.string(),
    parentSlug: z.string().nullable().optional(),
    imageUrl: z.string().nullable().optional(),
    productCount: z.number().default(0),
    children: z.array(categorySchema).default([]),
  }),
);

export interface Category {
  slug: string;
  name: string;
  parentSlug?: string | null;
  imageUrl?: string | null;
  productCount: number;
  children: Category[];
}

export const pageResponseSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int(),
    size: z.number().int(),
    totalItems: z.number().int(),
    totalPages: z.number().int(),
    hasNext: z.boolean(),
  });

// ------------------------------------------------------------------- search

export const searchResponseSchema = z.object({
  items: z.array(
    z.object({
      sku: z.string(),
      slug: z.string().nullable().optional(),
      titleAr: z.string().nullable().optional(),
      titleEn: z.string().nullable().optional(),
      brandName: z.string().nullable().optional(),
      priceMinor: z.number().int(),
      wasMinor: z.number().int().nullable().optional(),
      currency: z.string().default('EGP'),
      image: z.string().nullable().optional(),
      rating: z.number().nullable().optional(),
      ratingCount: z.number().int().nullable().optional(),
      tags: z.array(z.string()).default([]),
    }),
  ),
  page: z.number().int(),
  size: z.number().int(),
  totalItems: z.number().int(),
  totalPages: z.number().int(),
  hasNext: z.boolean(),
  facets: z.record(z.unknown()).default({}),
  tookMs: z.number().optional(),
});

export type SearchResponse = z.infer<typeof searchResponseSchema>;

// --------------------------------------------------------------------- auth

export const registerSchema = z
  .object({
    fullName: z.string().min(2, 'الاسم قصير جدًا').max(160),
    email: z.string().email('بريد إلكتروني غير صالح'),
    phone: z
      .string()
      .regex(/^\+?[0-9]{7,20}$/, 'رقم هاتف غير صالح')
      .optional()
      .or(z.literal('')),
    password: z
      .string()
      .min(8, 'كلمة المرور 8 أحرف على الأقل')
      .max(72)
      .regex(/[A-Za-z]/, 'يجب أن تحتوي على حرف')
      .regex(/[0-9]/, 'يجب أن تحتوي على رقم'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['confirmPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email('بريد إلكتروني غير صالح'),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  phone: z.string().nullable().optional(),
  fullName: z.string(),
  locale: z.string().default('ar'),
  emailVerified: z.boolean().default(false),
  roles: z.array(z.string()).default([]),
});

export type User = z.infer<typeof userSchema>;

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  tokenType: z.string().default('Bearer'),
  expiresIn: z.number().int(),
  user: userSchema,
});

// --------------------------------------------------------------------- cart

export const cartItemSchema = z.object({
  sku: z.string(),
  quantity: z.number().int().positive(),
  addedAt: z.string(),
});

export const cartSchema = z.object({
  id: z.string(),
  owner: z.enum(['user', 'guest']),
  items: z.array(cartItemSchema),
  updatedAt: z.string(),
});

export type Cart = z.infer<typeof cartSchema>;

export const cartSnapshotSchema = z.object({
  items: z.array(cartItemSchema),
  products: z.array(productSummarySchema),
  availability: z.record(z.number()).default({}),
  subtotalMinor: z.number().int().nonnegative(),
});

export type CartSnapshot = z.infer<typeof cartSnapshotSchema>;

// -------------------------------------------------------------------- order

export const addressSchema = z.object({
  fullName: z.string().min(2, 'الاسم مطلوب').max(160),
  phone: z.string().regex(/^\+?[0-9]{7,20}$/, 'رقم هاتف غير صالح'),
  line1: z.string().min(5, 'العنوان قصير جدًا').max(255),
  line2: z.string().max(255).optional().or(z.literal('')),
  area: z.string().max(120).optional().or(z.literal('')),
  city: z.string().min(2, 'المدينة مطلوبة').max(120),
  country: z.string().regex(/^[A-Z]{2}$/).default('AE'),
});

export type AddressInput = z.infer<typeof addressSchema>;

export const checkoutSchema = z.object({
  shippingAddress: addressSchema,
  paymentMethod: z.enum(['CARD', 'COD', 'APPLE_PAY', 'TABBY']),
  couponCode: z.string().max(32).optional().or(z.literal('')),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const orderItemSchema = z.object({
  sku: z.string(),
  title: z.string(),
  imageUrl: z.string().nullable().optional(),
  unitPriceMinor: z.number().int(),
  quantity: z.number().int(),
  lineTotalMinor: z.number().int(),
  sellerId: z.string().nullable().optional(),
});

export const orderSchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  status: z.string(),
  currency: z.string(),
  subtotalMinor: z.number().int(),
  shippingMinor: z.number().int(),
  discountMinor: z.number().int(),
  taxMinor: z.number().int(),
  totalMinor: z.number().int(),
  paymentMethod: z.string(),
  paymentId: z.string().nullable().optional(),
  failureReason: z.string().nullable().optional(),
  shippingAddress: z.record(z.unknown()).default({}),
  items: z.array(orderItemSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Order = z.infer<typeof orderSchema>;

export const orderSummarySchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  status: z.string(),
  currency: z.string(),
  totalMinor: z.number().int(),
  itemCount: z.number().int(),
  createdAt: z.string(),
});

export type OrderSummary = z.infer<typeof orderSummarySchema>;

// ------------------------------------------------------------- BFF payloads

export const pdpResponseSchema = z.object({
  product: productSchema,
  availability: z.object({
    sku: z.string().optional(),
    available: z.number().int().default(0),
    inStock: z.boolean().default(true),
    lowStock: z.boolean().default(false),
  }),
  similar: z.array(productSummarySchema).default([]),
  recommended: z.array(productSummarySchema).default([]),
});

export type PdpResponse = z.infer<typeof pdpResponseSchema>;

export const homeResponseSchema = z.object({
  categories: z.array(categorySchema).default([]),
  deals: z.array(productSummarySchema).default([]),
  bestsellers: z.array(productSummarySchema).default([]),
  forYou: z.array(productSummarySchema).default([]),
});

export type HomeResponse = z.infer<typeof homeResponseSchema>;

// -------------------------------------------------------------------- error

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
