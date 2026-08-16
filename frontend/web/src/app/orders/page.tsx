'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Package } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useHydrated } from '@/lib/use-hydrated';
import { api } from '@/lib/api';
import { orderSummarySchema, pageResponseSchema, type OrderSummary } from '@/lib/schemas';
import { formatMoney, formatDate, orderStatus } from '@/lib/format';

const listSchema = pageResponseSchema(orderSummarySchema);

const TONE_CLASSES: Record<string, string> = {
  positive: 'bg-noon-green/10 text-noon-green',
  warning: 'bg-noon-yellow/40 text-noon-ink',
  negative: 'bg-noon-red/10 text-noon-red',
  neutral: 'bg-noon-bg text-noon-muted',
};

export default function OrdersPage() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const hydrated = useHydrated();
  const getValidToken = useAuth((s) => s.getValidToken);

  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace('/login?next=/orders');
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const token = await getValidToken();
        if (!token) {
          router.replace('/login?next=/orders');
          return;
        }
        const result = await api.get('/api/v1/orders?page=0&size=20', listSchema, { token });
        if (!cancelled) setOrders(result.items);
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, user, getValidToken, router]);

  if (!hydrated || (user && orders === null && !error)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <Loader2 className="mx-auto size-8 animate-spin text-noon-muted" aria-hidden />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-xl font-extrabold">تعذّر تحميل الطلبات</h1>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-noon-yellow px-6 py-2.5 text-sm font-bold"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <Package className="mx-auto size-16 text-noon-line" aria-hidden />
        <h1 className="mt-4 text-xl font-extrabold">لا توجد طلبات بعد</h1>
        <Link href="/" className="mt-4 inline-flex rounded-lg bg-noon-yellow px-6 py-2.5 text-sm font-bold">
          ابدأ التسوّق
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-xl font-extrabold sm:text-2xl">طلباتي</h1>

      <ul className="space-y-3">
        {orders.map((order) => {
          const status = orderStatus(order.status);
          return (
            <li key={order.id}>
              <Link
                href={`/orders/${order.id}`}
                className="card-noon flex items-center justify-between gap-4 p-4 transition hover:shadow-md"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold tabular">{order.orderNumber}</span>
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${TONE_CLASSES[status.tone]}`}>
                      {status.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-noon-muted">
                    {formatDate(order.createdAt)} · {order.itemCount} منتج
                  </p>
                </div>
                <span className="shrink-0 font-extrabold tabular">
                  {formatMoney(order.totalMinor, order.currency)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
