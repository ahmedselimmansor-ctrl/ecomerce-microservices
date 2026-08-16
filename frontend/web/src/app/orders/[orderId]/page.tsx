'use client';

import Image from 'next/image';
import Link from 'next/link';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useHydrated } from '@/lib/use-hydrated';
import { api, ApiError } from '@/lib/api';
import { orderSchema, type Order } from '@/lib/schemas';
import { formatMoney, formatDate, orderStatus, PLACEHOLDER_IMAGE } from '@/lib/format';

/** الحالات التي ما زالت الـ Saga تعمل عليها ⇒ نستطلع حتى تستقر. */
const IN_FLIGHT = new Set(['PENDING', 'AWAITING_PAYMENT']);
const POLL_INTERVAL_MS = 2_000;
const MAX_POLLS = 30;

export default function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const router = useRouter();
  const hydrated = useHydrated();
  const user = useAuth((s) => s.user);
  const getValidToken = useAuth((s) => s.getValidToken);

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const pollCount = useRef(0);

  const load = useCallback(async (): Promise<Order | null> => {
    const token = await getValidToken();
    if (!token) {
      router.replace(`/login?next=/orders/${orderId}`);
      return null;
    }
    return api.get(`/api/v1/orders/${orderId}`, orderSchema, { token });
  }, [getValidToken, orderId, router]);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace(`/login?next=/orders/${orderId}`);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      try {
        const fresh = await load();
        if (cancelled || !fresh) return;
        setOrder(fresh);

        // الطلب يبدأ PENDING ثم تحرّكه الـ Saga — نستطلع حتى يستقر
        if (IN_FLIGHT.has(fresh.status) && pollCount.current < MAX_POLLS) {
          pollCount.current += 1;
          timer = setTimeout(tick, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.userMessage : 'تعذّر تحميل الطلب');
        }
      }
    }

    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [hydrated, user, orderId, load, router]);

  async function handleCancel() {
    setCancelling(true);
    try {
      const token = await getValidToken();
      const updated = await api.post(
        `/api/v1/orders/${orderId}/cancel`,
        orderSchema,
        { reason: 'CANCELLED_BY_USER' },
        { token },
      );
      setOrder(updated);
      toast.success('تم إلغاء الطلب');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.userMessage : 'تعذّر إلغاء الطلب');
    } finally {
      setCancelling(false);
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-xl font-extrabold">{error}</h1>
        <Link href="/orders" className="mt-4 inline-flex rounded-lg bg-noon-yellow px-6 py-2.5 text-sm font-bold">
          كل الطلبات
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <Loader2 className="mx-auto size-8 animate-spin text-noon-muted" aria-hidden />
      </div>
    );
  }

  const status = orderStatus(order.status);
  const inFlight = IN_FLIGHT.has(order.status);
  const canCancel = !['DELIVERED', 'CANCELLED', 'REFUNDED', 'SHIPPED'].includes(order.status);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <nav className="text-sm text-noon-muted">
        <Link href="/orders" className="hover:text-noon-ink">
          طلباتي
        </Link>
        <span className="mx-2">/</span>
        <span className="text-noon-ink tabular">{order.orderNumber}</span>
      </nav>

      <header className="card-noon p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-extrabold tabular">{order.orderNumber}</h1>
            <p className="mt-1 text-xs text-noon-muted">{formatDate(order.createdAt)}</p>
          </div>
          <StatusBadge status={order.status} label={status.label} tone={status.tone} />
        </div>

        {inFlight && (
          <p className="mt-4 flex items-center gap-2 rounded-lg bg-noon-bg p-3 text-sm">
            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
            جارٍ تأكيد المخزون والدفع… ستُحدَّث الصفحة تلقائيًا.
          </p>
        )}

        {order.failureReason && order.status === 'CANCELLED' && (
          <p className="mt-4 rounded-lg bg-noon-red/10 p-3 text-sm text-noon-red">
            سبب الإلغاء: {order.failureReason}
          </p>
        )}
      </header>

      <section className="card-noon divide-y divide-noon-line">
        <h2 className="p-4 text-base font-extrabold">المنتجات</h2>
        {order.items.map((item) => (
          <div key={item.sku} className="flex gap-3 p-4">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-white">
              <Image
                src={item.imageUrl || PLACEHOLDER_IMAGE}
                alt={item.title}
                fill
                sizes="64px"
                className="object-contain p-1"
                unoptimized={!item.imageUrl}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
              <p className="mt-1 text-xs text-noon-muted tabular">
                {formatMoney(item.unitPriceMinor, order.currency)} × {item.quantity}
              </p>
            </div>
            <span className="shrink-0 text-sm font-bold tabular">
              {formatMoney(item.lineTotalMinor, order.currency)}
            </span>
          </div>
        ))}
      </section>

      <section className="card-noon p-4">
        <h2 className="mb-3 text-base font-extrabold">الفاتورة</h2>
        <dl className="space-y-2 text-sm">
          <Row label="المجموع الفرعي" value={formatMoney(order.subtotalMinor, order.currency)} />
          {order.discountMinor > 0 && (
            <Row
              label="الخصم"
              value={`- ${formatMoney(order.discountMinor, order.currency)}`}
              tone="text-noon-green"
            />
          )}
          <Row
            label="الشحن"
            value={order.shippingMinor === 0 ? 'مجاني' : formatMoney(order.shippingMinor, order.currency)}
          />
          <Row label="ضريبة القيمة المضافة" value={formatMoney(order.taxMinor, order.currency)} />
          <div className="flex justify-between border-t border-noon-line pt-2 text-base font-extrabold">
            <dt>الإجمالي</dt>
            <dd className="tabular">{formatMoney(order.totalMinor, order.currency)}</dd>
          </div>
        </dl>
      </section>

      {canCancel && (
        <button
          type="button"
          onClick={handleCancel}
          disabled={cancelling}
          className="w-full rounded-lg border border-noon-red py-2.5 text-sm font-bold
                     text-noon-red transition hover:bg-noon-red/5 disabled:opacity-60"
        >
          {cancelling ? 'جارٍ الإلغاء…' : 'إلغاء الطلب'}
        </button>
      )}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-noon-muted">{label}</dt>
      <dd className={`tabular ${tone ?? ''}`}>{value}</dd>
    </div>
  );
}

function StatusBadge({ status, label, tone }: { status: string; label: string; tone: string }) {
  const Icon = status === 'CANCELLED' ? XCircle
    : ['CONFIRMED', 'DELIVERED'].includes(status) ? CheckCircle2
    : Clock;

  const classes: Record<string, string> = {
    positive: 'bg-noon-green/10 text-noon-green',
    warning: 'bg-noon-yellow/40 text-noon-ink',
    negative: 'bg-noon-red/10 text-noon-red',
    neutral: 'bg-noon-bg text-noon-muted',
  };

  return (
    <span className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold ${classes[tone]}`}>
      <Icon className="size-4" aria-hidden />
      {label}
    </span>
  );
}
