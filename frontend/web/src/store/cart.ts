'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/api';
import { cartSchema, cartSnapshotSchema, type CartSnapshot } from '@/lib/schemas';
import { useAuth } from './auth';
import { z } from 'zod';

interface CartState {
  guestToken: string | null;
  snapshot: CartSnapshot | null;
  loading: boolean;

  ensureGuestToken: () => Promise<string>;
  refresh: () => Promise<void>;
  addItem: (sku: string, quantity?: number) => Promise<void>;
  setQuantity: (sku: string, quantity: number) => Promise<void>;
  removeItem: (sku: string) => Promise<void>;
  clear: () => Promise<void>;
  /** يُستدعى مباشرة بعد تسجيل الدخول لدمج سلة الزائر. */
  mergeAfterLogin: () => Promise<void>;
  itemCount: () => number;
}

const guestTokenSchema = z.object({ guestToken: z.string() });

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      guestToken: null,
      snapshot: null,
      loading: false,

      ensureGuestToken: async () => {
        const existing = get().guestToken;
        if (existing) return existing;
        const { guestToken } = await api.post('/api/v1/cart/guest-token', guestTokenSchema);
        set({ guestToken });
        return guestToken;
      },

      refresh: async () => {
        set({ loading: true });
        try {
          const token = await useAuth.getState().getValidToken();
          const guestToken = token ? null : await get().ensureGuestToken();
          const snapshot = await api.get('/api/v1/bff/cart', cartSnapshotSchema, {
            token,
            guestToken,
          });
          set({ snapshot });
        } finally {
          set({ loading: false });
        }
      },

      addItem: async (sku, quantity = 1) => {
        const token = await useAuth.getState().getValidToken();
        const guestToken = token ? null : await get().ensureGuestToken();
        await api.post('/api/v1/cart/items', cartSchema, { sku, quantity }, { token, guestToken });
        await get().refresh();
      },

      setQuantity: async (sku, quantity) => {
        const token = await useAuth.getState().getValidToken();
        const guestToken = token ? null : await get().ensureGuestToken();
        await api.put(`/api/v1/cart/items/${encodeURIComponent(sku)}`, cartSchema,
          { quantity }, { token, guestToken });
        await get().refresh();
      },

      removeItem: async (sku) => {
        const token = await useAuth.getState().getValidToken();
        const guestToken = token ? null : await get().ensureGuestToken();
        await api.delete(`/api/v1/cart/items/${encodeURIComponent(sku)}`, cartSchema,
          { token, guestToken });
        await get().refresh();
      },

      clear: async () => {
        const token = await useAuth.getState().getValidToken();
        const guestToken = token ? null : await get().ensureGuestToken();
        await api.delete('/api/v1/cart', z.unknown(), { token, guestToken });
        set({ snapshot: null });
      },

      mergeAfterLogin: async () => {
        const { guestToken } = get();
        const token = await useAuth.getState().getValidToken();
        if (!guestToken || !token) {
          await get().refresh();
          return;
        }
        await api
          .post('/api/v1/cart/merge', cartSchema, { guestToken }, { token })
          .catch(() => undefined);
        // توكن الزائر استُهلك في الدمج
        set({ guestToken: null });
        await get().refresh();
      },

      itemCount: () => {
        const snapshot = get().snapshot;
        if (!snapshot) return 0;
        return snapshot.items.reduce((sum, item) => sum + item.quantity, 0);
      },
    }),
    {
      name: 'noon-cart',
      // السلة نفسها تعيش على الخادم؛ محليًا نحفظ توكن الزائر فقط
      partialize: (state) => ({ guestToken: state.guestToken }),
    },
  ),
);
