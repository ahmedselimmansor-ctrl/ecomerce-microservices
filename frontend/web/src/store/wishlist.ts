'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProductSummary } from '@/lib/schemas';

interface WishlistState {
  items: ProductSummary[];
  toggle: (product: ProductSummary) => void;
  remove: (sku: string) => void;
  clear: () => void;
  has: (sku: string) => boolean;
  count: () => number;
}

/**
 * المفضّلة محليًا في المتصفح.
 *
 * <p>لا توجد خدمة wishlist في المنصة، والتخزين المحلي خيار مقصود لا نقص:
 * المفضّلة نية شراء لا التزام، وفقدانها عند تغيير الجهاز مقبول. عند إضافة
 * خدمة لاحقًا يبقى هذا المخزن كطبقة تفاؤلية أمامها.
 */
export const useWishlist = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],

      toggle: (product) => {
        const exists = get().items.some((i) => i.sku === product.sku);
        set({
          items: exists
            ? get().items.filter((i) => i.sku !== product.sku)
            : [product, ...get().items].slice(0, 200),
        });
      },

      remove: (sku) => set({ items: get().items.filter((i) => i.sku !== sku) }),

      clear: () => set({ items: [] }),

      has: (sku) => get().items.some((i) => i.sku === sku),

      count: () => get().items.length,
    }),
    { name: 'topchoice-wishlist' },
  ),
);
