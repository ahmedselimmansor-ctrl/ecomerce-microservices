'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Plus, Search, Loader2, Pencil, Archive, Eye, EyeOff, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { adminApi, type AdminProduct } from '@/lib/admin-api';
import { formatMoney, PLACEHOLDER_IMAGE } from '@/lib/format';
import { ApiError } from '@/lib/api';

const STATUS_FILTERS = [
  { key: '', label: 'الكل' },
  { key: 'ACTIVE', label: 'نشط' },
  { key: 'INACTIVE', label: 'غير نشط' },
  { key: 'ARCHIVED', label: 'مؤرشف' },
];

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: 'bg-noon-green/10 text-noon-green',
  INACTIVE: 'bg-noon-yellow/40 text-noon-ink',
  ARCHIVED: 'bg-noon-red/10 text-noon-red',
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), size: '20' });
      if (search.trim()) params.set('search', search.trim());
      if (status) params.set('status', status);

      const result = await adminApi.listProducts(params);
      setProducts(result.items);
      setTotalItems(result.totalItems);
      setTotalPages(result.totalPages);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.userMessage : 'تعذّر تحميل المنتجات');
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  // debounce على البحث فقط — تغيير الحالة أو الصفحة يُحمّل فورًا
  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  async function toggleStatus(product: AdminProduct) {
    const next = product.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setBusy(product.sku);
    try {
      await adminApi.setProductStatus(product.sku, next);
      toast.success(next === 'ACTIVE' ? 'تم تفعيل المنتج' : 'تم إخفاء المنتج');
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.userMessage : 'تعذّر تغيير الحالة');
    } finally {
      setBusy(null);
    }
  }

  async function archive(product: AdminProduct) {
    if (!confirm(`أرشفة "${product.title.ar ?? product.sku}"؟ لن يظهر في المتجر بعدها.`)) return;
    setBusy(product.sku);
    try {
      await adminApi.archiveProduct(product.sku);
      toast.success('تمت الأرشفة');
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.userMessage : 'تعذّرت الأرشفة');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold sm:text-2xl">المنتجات</h1>
          <p className="text-sm text-noon-muted tabular">{totalItems} منتج</p>
        </div>
        <Link
          href="/admin/products/new"
          className="flex items-center gap-2 rounded-lg bg-noon-yellow px-4 py-2.5
                     text-sm font-extrabold text-noon-ink transition hover:brightness-95"
        >
          <Plus className="size-4" aria-hidden />
          منتج جديد
        </Link>
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
            placeholder="ابحث بالـ SKU أو الاسم أو العلامة…"
            className="w-full rounded-lg border border-noon-line py-2 ps-9 pe-3 text-sm"
          />
        </div>

        <div className="flex gap-1.5">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.key || 'all'}
              type="button"
              onClick={() => {
                setStatus(filter.key);
                setPage(0);
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition
                ${status === filter.key
                  ? 'bg-noon-ink text-white'
                  : 'bg-noon-bg text-noon-ink hover:bg-noon-line'}`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-noon-line bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-noon-line bg-noon-bg text-start">
            <tr className="text-[13px] text-noon-muted">
              <th className="p-3 text-start font-semibold">المنتج</th>
              <th className="p-3 text-start font-semibold">SKU</th>
              <th className="p-3 text-start font-semibold">السعر</th>
              <th className="p-3 text-start font-semibold">القسم</th>
              <th className="p-3 text-start font-semibold">الحالة</th>
              <th className="p-3 text-end font-semibold">إجراءات</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-noon-line">
            {loading && products.length === 0 && (
              <tr>
                <td colSpan={6} className="p-10 text-center">
                  <Loader2 className="mx-auto size-6 animate-spin text-noon-muted" aria-hidden />
                </td>
              </tr>
            )}

            {!loading && products.length === 0 && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-noon-muted">
                  لا توجد منتجات مطابقة
                </td>
              </tr>
            )}

            {products.map((product) => (
              <tr key={product.sku} className="hover:bg-noon-bg/60">
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <span className="relative size-11 shrink-0 overflow-hidden rounded bg-noon-bg">
                      <Image
                        src={product.images[0] || PLACEHOLDER_IMAGE}
                        alt=""
                        fill
                        sizes="44px"
                        className="object-contain p-0.5"
                        unoptimized={!product.images[0]}
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="block max-w-[280px] truncate font-medium">
                        {product.title.ar ?? product.title.en ?? product.sku}
                      </span>
                      {product.brandName && (
                        <span className="block text-xs text-noon-muted">{product.brandName}</span>
                      )}
                    </span>
                  </div>
                </td>
                <td className="p-3 font-mono text-xs text-noon-muted">{product.sku}</td>
                <td className="p-3">
                  <span className="font-bold tabular">
                    {formatMoney(product.priceMinor, product.currency)}
                  </span>
                  {product.wasMinor && product.wasMinor > product.priceMinor && (
                    <span className="ms-1.5 text-xs text-noon-muted line-through tabular">
                      {formatMoney(product.wasMinor, product.currency)}
                    </span>
                  )}
                </td>
                <td className="p-3 text-xs text-noon-muted">
                  {product.categoryPath.join(' › ') || '—'}
                </td>
                <td className="p-3">
                  <span
                    className={`rounded px-2 py-1 text-xs font-semibold
                      ${STATUS_STYLE[product.status] ?? 'bg-noon-bg text-noon-muted'}`}
                  >
                    {product.status}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/admin/products/${encodeURIComponent(product.sku)}`}
                      aria-label={`تعديل ${product.sku}`}
                      className="grid size-8 place-items-center rounded-lg text-noon-blue
                                 hover:bg-noon-blue/10"
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Link>

                    <button
                      type="button"
                      onClick={() => void toggleStatus(product)}
                      disabled={busy === product.sku || product.status === 'ARCHIVED'}
                      aria-label={product.status === 'ACTIVE' ? 'إخفاء' : 'تفعيل'}
                      className="grid size-8 place-items-center rounded-lg text-noon-ink
                                 hover:bg-noon-bg disabled:opacity-40"
                    >
                      {product.status === 'ACTIVE' ? (
                        <EyeOff className="size-4" aria-hidden />
                      ) : (
                        <Eye className="size-4" aria-hidden />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => void archive(product)}
                      disabled={busy === product.sku || product.status === 'ARCHIVED'}
                      aria-label={`أرشفة ${product.sku}`}
                      className="grid size-8 place-items-center rounded-lg text-noon-red
                                 hover:bg-noon-red/10 disabled:opacity-40"
                    >
                      <Archive className="size-4" aria-hidden />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="grid size-9 place-items-center rounded-lg border border-noon-line
                       bg-white disabled:opacity-40"
            aria-label="الصفحة السابقة"
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
            className="grid size-9 place-items-center rounded-lg border border-noon-line
                       bg-white disabled:opacity-40"
            aria-label="الصفحة التالية"
          >
            <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
          </button>
        </nav>
      )}
    </div>
  );
}
