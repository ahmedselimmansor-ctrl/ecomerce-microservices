'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, ApiError } from '@/lib/api';
import { tokenPairSchema, type User } from '@/lib/schemas';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;

  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    fullName: string;
    email: string;
    password: string;
    phone?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  /** يعيد توكن وصول صالحًا، مجدِّدًا إياه إن قارب على الانتهاء. */
  getValidToken: () => Promise<string | null>;
}

/**
 * ملاحظة أمنية صريحة:
 * تخزين التوكن في localStorage مكشوف لهجمات XSS. الخيار الأمتن في الإنتاج هو
 * refresh token في كوكي HttpOnly + SameSite=Strict، مع إبقاء access token في
 * الذاكرة فقط. اخترنا localStorage هنا لبساطة العرض التوضيحي — انظر
 * docs/07-security.md.
 */
export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,

      login: async (email, password) => {
        const pair = await api.post('/api/v1/auth/login', tokenPairSchema, { email, password });
        set({
          user: pair.user,
          accessToken: pair.accessToken,
          refreshToken: pair.refreshToken,
          expiresAt: Date.now() + pair.expiresIn * 1000,
        });
      },

      register: async (input) => {
        const pair = await api.post('/api/v1/auth/register', tokenPairSchema, {
          fullName: input.fullName,
          email: input.email,
          password: input.password,
          phone: input.phone || undefined,
          locale: 'ar',
        });
        set({
          user: pair.user,
          accessToken: pair.accessToken,
          refreshToken: pair.refreshToken,
          expiresAt: Date.now() + pair.expiresIn * 1000,
        });
      },

      logout: async () => {
        const { refreshToken } = get();
        if (refreshToken) {
          // الخروج من الخادم يُبطل التوكن فعليًا — لا يكفي مسحه محليًا
          await api
            .post('/api/v1/auth/logout', tokenPairSchema.optional(), { refreshToken })
            .catch(() => undefined);
        }
        set({ user: null, accessToken: null, refreshToken: null, expiresAt: null });
      },

      getValidToken: async () => {
        const { accessToken, refreshToken, expiresAt } = get();
        if (!accessToken) return null;

        // نجدّد قبل الانتهاء بـ 60 ثانية تفاديًا لسباق أثناء الطلب
        if (expiresAt && Date.now() < expiresAt - 60_000) {
          return accessToken;
        }
        if (!refreshToken) {
          set({ user: null, accessToken: null, refreshToken: null, expiresAt: null });
          return null;
        }

        try {
          const pair = await api.post('/api/v1/auth/refresh', tokenPairSchema, { refreshToken });
          set({
            user: pair.user,
            accessToken: pair.accessToken,
            refreshToken: pair.refreshToken,
            expiresAt: Date.now() + pair.expiresIn * 1000,
          });
          return pair.accessToken;
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) {
            set({ user: null, accessToken: null, refreshToken: null, expiresAt: null });
          }
          return null;
        }
      },
    }),
    {
      name: 'noon-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        expiresAt: state.expiresAt,
      }),
    },
  ),
);
