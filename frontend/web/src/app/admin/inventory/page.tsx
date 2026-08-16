'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Search, Loader2, Check, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { adminApi, type StockRow } from '@/lib/admin-api';
import { ApiError } from '@/lib/api';

export default function AdminInventoryPage() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(searchParams.get('low') === 'true');
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), size: '20' });
      if (search.trim()) params.set('search', search.trim());
      if (lowOnly) params.set('lowStockOnly', 'true');

      const result = await adminApi.listStock(params);
      setRows(result.items);
      setTotalItems(result.totalItems);
      setTotalPages(result.totalPages);
      setDrafts({});
    } catch (err) {
      toast.error(err instanceof ApiError ? err.userMessage : 'تعذّر تحميل المخزون');
    } finally {
      setLoading(false);
    }
  }, [page, search, lowOnly]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  async function save(row: StockRow) {
    const raw = drafts[row.sku];
    if (raw === undefined) return;

    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
      toast.error('الكمية يجب أن تكون عددًا صحيحًا غير سالب');
      return;
    }

    setBusy(row.sku);
    try {
      await adminApi.saveStock(row.sku, value, row.warehouseId);
      toast.success(`تم ضبط مخزون ${row.sku} على ${value}`);
      await load();
    } catch (err) {
      // الخادم يرفض النزول تحت الكمية المحجوزة لطلبات جارية
      toast.error(err instanceof ApiError ? err.userMessage : 'تعذّر حفظ الكمية');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-extrabold sm:text-2xl">المخزون</h1>
        <p className="text-sm text-noon-muted tabular">{totalItems} صنف</p>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-noon-line
                      bg-white p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4
                             text-noon-muted" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="ابحث بالـ SKU…"
            className="w-full rounded-lg border border-noon-line py-2 ps-9 pe-3 text-sm"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => {
              setLowOnly(e.target.checked);
              setPage(0);
            }}
            className="size-4"
          />
          المخزون المنخفض فقط
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-noon-line bg-white">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="border-b border-noon-line bg-noon-bg">
            <tr className="text-[13px] text-noon-muted">
              <th className="p-3 text-start font-semibold">SKU</th>
              <th className="p-3 text-start font-semibold">المستودع</th>
              <th className="p-3 text-start font-semibold">الموجود</th>
              <th className="p-3 text-start font-semibold">محجوز</th>
              <th className="p-3 text-start font-semibold">المتاح</th>
              <th className="p-3 text-start font-semibold">ضبط الكمية</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-noon-line">
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-10 text-center">
                  <Loader2 className="mx-auto size-6 animate-spin text-noon-muted" aria-hidden />
                </td>
              </tr>
            )}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-noon-muted">
                  لا توجد أصناف مطابقة
                </td>
              </tr>
            )}

            {rows.map((row) => {
              const low = row.available <= 5;
              const out = row.available <= 0;
              const draft = drafts[row.sku];
              const dirty = draft !== undefined && Number(draft) !== row.onHand;

              return (
                <tr key={row.sku} className="hover:bg-noon-bg/60">
                  <td className="p-3 font-mono text-xs">{row.sku}</td>
                  <td className="p-3 text-xs text-noon-muted">{row.warehouseId}</td>
                  <td className="p-3 tabular">{row.onHand}</td>
                  <td className="p-3 tabular text-noon-muted">{row.reserved}</td>
                  <td className="p-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs
                        font-bold tabular
                        ${out
                          ? 'bg-noon-red/10 text-noon-red'
                          : low
                            ? 'bg-noon-yellow/40 text-noon-ink'
                            : 'bg-noon-green/10 text-noon-green'}`}
                    >
                      {(out || low) && <AlertTriangle className="size-3" aria-hidden />}
                      {row.available}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        value={draft ?? String(row.onHand)}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [row.sku]: e.target.value }))
                        }
                        className="w-24 rounded-lg border border-noon-line px-2 py-1.5
                                   text-sm tabular"
                      />
                      <button
                        type="button"
                        onClick={() => void save(row)}
                        disabled={!dirty || busy === row.sku}
                        aria-label={`حفظ كمية ${row.sku}`}
                        className="grid size-8 place-items-center rounded-lg bg-noon-yellow
                                   text-noon-ink transition hover:brightness-95
                                   disabled:opacity-30"
                      >
                        {busy === row.sku ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <Check className="size-4" aria-hidden />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="rounded-lg bg-noon-bg p-3 text-xs text-noon-muted">
        «المحجوز» كميات مرتبطة بطلبات جارية. لا يمكن خفض «الموجود» تحتها — الخادم يرفض
        العملية حمايةً لطلبات قيد التنفيذ.
      </p>

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            aria-label="الصفحة السابقة"
            className="grid size-9 place-items-center rounded-lg border border-noon-line
                       bg-white disabled:opacity-40"
          >
            <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
          </button>
          <span className="px-3 text-sm text-noon-muted tabular">
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            aria-label="الصفحة التالية"
            className="grid size-9 place-items-center rounded-lg border border-noon-line
                       bg-white disabled:opacity-40"
          >
            <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
          </button>
        </nav>
      )}
    </div>
  );
}
