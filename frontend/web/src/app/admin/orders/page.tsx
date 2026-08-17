'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Search, Loader2, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { adminApi, type AdminOrderSummary } from '@/lib/admin-api';
import { formatMoney, formatDateShort, orderStatus, STATUS_TONE_CLASS } from '@/lib/format';
import { ApiError } from '@/lib/api';

const STATUSES = [
  '', 'PENDING', 'AWAITING_PAYMENT', 'CONFIRMED', 'PROCESSING',
  'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED',
];

export default function AdminOrdersPage() {
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(searchParams.get('status') ?? '');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), size: '20' });
      if (search.trim()) params.set('search', search.trim());
      if (status) params.set('status', status);

      const result = await adminApi.listOrders(params);
      setOrders(result.items);
      setTotalItems(result.totalItems);
      setTotalPages(result.totalPages);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.userMessage : 'تعذّر تحميل الطلبات');
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-extrabold sm:text-2xl">الطلبات</h1>
        <p className="text-sm text-tc-muted tabular">{totalItems} طلب</p>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-tc-line
                      bg-white p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4
                             text-tc-muted" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="ابحث برقم الطلب…"
            className="w-full rounded-lg border border-tc-line py-2 ps-9 pe-3 text-sm"
          />
        </div>

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
          className="rounded-lg border border-tc-line px-3 py-2 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s || 'all'} value={s}>
              {s ? orderStatus(s).label : 'كل الحالات'}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-tc-line bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-tc-line bg-tc-bg">
            <tr className="text-[13px] text-tc-muted">
              <th className="p-3 text-start font-semibold">رقم الطلب</th>
              <th className="p-3 text-start font-semibold">التاريخ</th>
              <th className="p-3 text-start font-semibold">الأصناف</th>
              <th className="p-3 text-start font-semibold">الإجمالي</th>
              <th className="p-3 text-start font-semibold">الدفع</th>
              <th className="p-3 text-start font-semibold">الحالة</th>
              <th className="p-3 text-end font-semibold" />
            </tr>
          </thead>

          <tbody className="divide-y divide-tc-line">
            {loading && orders.length === 0 && (
              <tr>
                <td colSpan={7} className="p-10 text-center">
                  <Loader2 className="mx-auto size-6 animate-spin text-tc-muted" aria-hidden />
                </td>
              </tr>
            )}

            {!loading && orders.length === 0 && (
              <tr>
                <td colSpan={7} className="p-10 text-center text-tc-muted">
                  لا توجد طلبات مطابقة
                </td>
              </tr>
            )}

            {orders.map((order) => {
              const meta = orderStatus(order.status);
              return (
                <tr key={order.id} className="hover:bg-tc-bg/60">
                  <td className="p-3 font-bold tabular">{order.orderNumber}</td>
                  <td className="p-3 text-xs text-tc-muted">
                    {formatDateShort(order.createdAt)}
                  </td>
                  <td className="p-3 tabular">{order.itemCount}</td>
                  <td className="p-3 font-bold tabular">
                    {formatMoney(order.totalMinor, order.currency)}
                  </td>
                  <td className="p-3 text-xs">{order.paymentMethod}</td>
                  <td className="p-3">
                    <span className={`rounded px-2 py-1 text-xs font-semibold
                                      ${STATUS_TONE_CLASS[meta.tone]}`}>
                      {meta.label}
                    </span>
                    {order.failureReason && (
                      <span className="mt-1 block text-[10px] text-tc-muted">
                        {order.failureReason}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-end">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      aria-label={`عرض ${order.orderNumber}`}
                      className="inline-grid size-8 place-items-center rounded-lg text-tc-link
                                 hover:bg-tc-link/10"
                    >
                      <Eye className="size-4" aria-hidden />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            aria-label="الصفحة السابقة"
            className="grid size-9 place-items-center rounded-lg border border-tc-line
                       bg-white disabled:opacity-40"
          >
            <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
          </button>
          <span className="px-3 text-sm text-tc-muted tabular">
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            aria-label="الصفحة التالية"
            className="grid size-9 place-items-center rounded-lg border border-tc-line
                       bg-white disabled:opacity-40"
          >
            <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
          </button>
        </nav>
      )}
    </div>
  );
}
