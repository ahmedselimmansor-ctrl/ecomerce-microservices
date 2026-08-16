'use client';

import Image from 'next/image';
import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, ArrowRight, AlertTriangle, XCircle } from 'lucide-react';
import { adminApi } from '@/lib/admin-api';
import { orderSchema, type Order } from '@/lib/schemas';
import { formatMoney, formatDate, orderStatus, STATUS_TONE_CLASS, PLACEHOLDER_IMAGE } from '@/lib/format';
import { ApiError } from '@/lib/api';

/**
 * الانتقالات المسموحة — نسخة من آلة الحالة في order-service.
 *
 * <p>تكرارها هنا يمنع عرض أزرار تؤدي إلى رفض من الخادم. الخادم يبقى المرجع:
 * أي انتقال غير مسموح يُرفض بـ 409 حتى لو استُدعي مباشرة.
 */
const NEXT_STATUSES: Record<string, string[]> = {
  PENDING: ['CANCELLED'],
  AWAITING_PAYMENT: ['CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

export default function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = use(params);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const raw = await adminApi.getOrder(orderId);
      setOrder(orderSchema.parse(raw));
    } catch (err) {
      setError(err instanceof ApiError ? err.userMessage : 'تعذّر تحميل الطلب');
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(status: string) {
    setBusy(true);
    try {
      if (status === 'CANCELLED') {
        await adminApi.cancelOrder(orderId, 'CANCELLED_BY_ADMIN');
        toast.success('أُلغي الطلب وتم تحرير المخزون');
      } else {
        await adminApi.setOrderStatus(orderId, status);
        toast.success(`تم تحديث الحالة إلى ${orderStatus(status).label}`);
      }
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.userMessage : 'تعذّر تحديث الحالة');
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="rounded-lg border border-noon-line bg-white p-10 text-center">
        <AlertTriangle className="mx-auto size-10 text-noon-red" aria-hidden />
        <p className="mt-3 font-bold">{error}</p>
        <Link
          href="/admin/orders"
          className="mt-4 inline-flex rounded-lg bg-noon-yellow px-6 py-2.5 text-sm font-bold"
        >
          العودة للقائمة
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="grid h-64 place-items-center">
        <Loader2 className="size-8 animate-spin text-noon-muted" aria-hidden />
      </div>
    );
  }

  const meta = orderStatus(order.status);
  const allowed = NEXT_STATUSES[order.status] ?? [];
  const address = order.shippingAddress as Record<string, string>;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/orders"
            aria-label="رجوع"
            className="grid size-9 place-items-center rounded-lg border border-noon-line bg-white"
          >
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
          </Link>
          <div>
            <h1 className="text-xl font-extrabold tabular sm:text-2xl">{order.orderNumber}</h1>
            <p className="text-xs text-noon-muted">{formatDate(order.createdAt)}</p>
          </div>
        </div>

        <span className={`rounded-lg px-4 py-2 text-sm font-bold ${STATUS_TONE_CLASS[meta.tone]}`}>
          {meta.label}
        </span>
      </header>

      {allowed.length > 0 && (
        <section className="rounded-lg border border-noon-line bg-white p-4">
          <h2 className="mb-3 text-base font-extrabold">تغيير الحالة</h2>
          <div className="flex flex-wrap gap-2">
            {allowed.map((status) => {
              const isCancel = status === 'CANCELLED';
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => void changeStatus(status)}
                  disabled={busy}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold
                    transition disabled:opacity-60
                    ${isCancel
                      ? 'border border-noon-red text-noon-red hover:bg-noon-red/5'
                      : 'bg-noon-yellow text-noon-ink hover:brightness-95'}`}
                >
                  {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  {isCancel && !busy && <XCircle className="size-4" aria-hidden />}
                  {orderStatus(status).label}
                </button>
              );
            })}
          </div>
          {order.status === 'CONFIRMED' && (
            <p className="mt-3 text-xs text-noon-muted">
              الشحن يرسل إشعارًا للعميل تلقائيًا عبر notification-service.
            </p>
          )}
        </section>
      )}

      {order.failureReason && (
        <p className="rounded-lg bg-noon-red/10 p-3 text-sm text-noon-red">
          سبب الفشل/الإلغاء: {order.failureReason}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-lg border border-noon-line bg-white">
          <h2 className="border-b border-noon-line p-4 text-base font-extrabold">
            المنتجات ({order.items.length})
          </h2>
          <ul className="divide-y divide-noon-line">
            {order.items.map((item) => (
              <li key={item.sku} className="flex gap-3 p-4">
                <span className="relative size-16 shrink-0 overflow-hidden rounded bg-noon-bg">
                  <Image
                    src={item.imageUrl || PLACEHOLDER_IMAGE}
                    alt=""
                    fill
                    sizes="64px"
                    className="object-contain p-1"
                    unoptimized={!item.imageUrl}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
                  <p className="mt-1 font-mono text-[11px] text-noon-muted">{item.sku}</p>
                  <p className="text-xs text-noon-muted tabular">
                    {formatMoney(item.unitPriceMinor, order.currency)} × {item.quantity}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold tabular">
                  {formatMoney(item.lineTotalMinor, order.currency)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-4">
          <section className="rounded-lg border border-noon-line bg-white p-4">
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
              <Row label="الضريبة" value={formatMoney(order.taxMinor, order.currency)} />
              <div className="flex justify-between border-t border-noon-line pt-2
                              text-base font-extrabold">
                <dt>الإجمالي</dt>
                <dd className="tabular">{formatMoney(order.totalMinor, order.currency)}</dd>
              </div>
            </dl>
            <p className="mt-3 border-t border-noon-line pt-3 text-xs text-noon-muted">
              طريقة الدفع: <strong className="text-noon-ink">{order.paymentMethod}</strong>
              {order.paymentId && (
                <>
                  <br />
                  معرّف الدفعة: <span className="font-mono">{order.paymentId}</span>
                </>
              )}
            </p>
          </section>

          <section className="rounded-lg border border-noon-line bg-white p-4">
            <h2 className="mb-3 text-base font-extrabold">عنوان الشحن</h2>
            <address className="space-y-1 text-sm not-italic text-noon-ink/80">
              <p className="font-semibold text-noon-ink">{address.fullName}</p>
              <p className="tabular">{address.phone}</p>
              <p>{address.line1}</p>
              {address.line2 && <p>{address.line2}</p>}
              <p>
                {[address.area, address.city, address.country].filter(Boolean).join('، ')}
              </p>
            </address>
          </section>
        </div>
      </div>
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
