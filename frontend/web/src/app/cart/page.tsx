'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Trash2, Minus, Plus, ShoppingBag } from 'lucide-react';
import { useCart } from '@/store/cart';
import { formatMoney, PLACEHOLDER_IMAGE } from '@/lib/format';
import { ApiError } from '@/lib/api';

const FREE_SHIPPING_THRESHOLD = 10_000; // 100.00 EGP — يطابق order-service
const SHIPPING_FEE = 1_500;
const VAT_PERCENT = 5;

export default function CartPage() {
  const snapshot = useCart((s) => s.snapshot);
  const loading = useCart((s) => s.loading);
  const refresh = useCart((s) => s.refresh);
  const setQuantity = useCart((s) => s.setQuantity);
  const removeItem = useCart((s) => s.removeItem);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void refresh().catch(() => toast.error('تعذّر تحميل السلة'));
  }, [refresh]);

  async function change(sku: string, quantity: number) {
    setBusy(sku);
    try {
      await setQuantity(sku, quantity);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.userMessage : 'تعذّر تحديث الكمية');
    } finally {
      setBusy(null);
    }
  }

  async function remove(sku: string) {
    setBusy(sku);
    try {
      await removeItem(sku);
      toast.success('أُزيل من السلة');
    } catch {
      toast.error('تعذّرت الإزالة');
    } finally {
      setBusy(null);
    }
  }

  if (loading && !snapshot) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="skeleton h-40 rounded-xl" />
      </div>
    );
  }

  const items = snapshot?.items ?? [];
  const products = new Map((snapshot?.products ?? []).map((p) => [p.sku, p]));

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center">
        <ShoppingBag className="mx-auto size-16 text-tc-line" aria-hidden />
        <h1 className="mt-4 text-xl font-extrabold">سلتك فارغة</h1>
        <p className="mt-2 text-sm text-tc-muted">ابدأ التسوّق وأضف منتجاتك المفضلة.</p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-lg bg-tc-accent px-6 py-2.5 text-sm font-bold"
        >
          تصفّح المنتجات
        </Link>
      </div>
    );
  }

  const subtotal = snapshot?.subtotalMinor ?? 0;
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  const vat = Math.round((subtotal * VAT_PERCENT) / 100);
  const total = subtotal + shipping + vat;
  const remainingForFreeShipping = FREE_SHIPPING_THRESHOLD - subtotal;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="mb-4 text-xl font-extrabold sm:text-2xl">
        سلة التسوّق <span className="text-tc-muted tabular">({items.length})</span>
      </h1>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <ul className="card-tc divide-y divide-tc-line">
          {items.map((item) => {
            const product = products.get(item.sku);
            const available = snapshot?.availability[item.sku];
            const outOfStock = available !== undefined && available < item.quantity;

            return (
              <li key={item.sku} className="flex gap-3 p-4">
                <Link
                  href={`/product/${product?.slug ?? item.sku}`}
                  className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-white"
                >
                  <Image
                    src={product?.image || PLACEHOLDER_IMAGE}
                    alt={product?.title ?? item.sku}
                    fill
                    sizes="80px"
                    className="object-contain p-1"
                    unoptimized={!product?.image}
                  />
                </Link>

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Link
                    href={`/product/${product?.slug ?? item.sku}`}
                    className="line-clamp-2 text-sm font-medium hover:underline"
                  >
                    {product?.title ?? item.sku}
                  </Link>
                  {product?.brandName && (
                    <span className="text-xs text-tc-muted">{product.brandName}</span>
                  )}

                  {outOfStock && (
                    <span className="text-xs font-semibold text-tc-berry">
                      متوفر منه {available} فقط
                    </span>
                  )}

                  <div className="mt-auto flex items-center gap-2 pt-2">
                    <div className="flex items-center rounded-lg border border-tc-line">
                      <button
                        type="button"
                        onClick={() => void change(item.sku, item.quantity - 1)}
                        disabled={busy === item.sku}
                        aria-label="إنقاص الكمية"
                        className="grid size-8 place-items-center hover:bg-tc-bg disabled:opacity-50"
                      >
                        <Minus className="size-3.5" aria-hidden />
                      </button>
                      <span className="w-9 text-center text-sm font-bold tabular">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => void change(item.sku, item.quantity + 1)}
                        disabled={busy === item.sku || item.quantity >= 20}
                        aria-label="زيادة الكمية"
                        className="grid size-8 place-items-center hover:bg-tc-bg disabled:opacity-50"
                      >
                        <Plus className="size-3.5" aria-hidden />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => void remove(item.sku)}
                      disabled={busy === item.sku}
                      aria-label={`إزالة ${product?.title ?? item.sku}`}
                      className="grid size-8 place-items-center rounded-lg text-tc-berry
                                 hover:bg-tc-berry/10 disabled:opacity-50"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>

                <div className="shrink-0 text-end">
                  <span className="text-sm font-extrabold tabular">
                    {formatMoney((product?.priceMinor ?? 0) * item.quantity,
                      product?.currency ?? 'EGP')}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        <aside className="card-tc h-fit space-y-3 p-4 lg:sticky lg:top-24">
          <h2 className="text-base font-extrabold">ملخّص الطلب</h2>

          {remainingForFreeShipping > 0 && (
            <p className="rounded-lg bg-tc-accent/30 p-2.5 text-xs">
              أضف بقيمة{' '}
              <strong className="tabular">{formatMoney(remainingForFreeShipping)}</strong>{' '}
              للحصول على شحن مجاني
            </p>
          )}

          <dl className="space-y-2 border-t border-tc-line pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-tc-muted">المجموع الفرعي</dt>
              <dd className="tabular">{formatMoney(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-tc-muted">الشحن</dt>
              <dd className="tabular">
                {shipping === 0 ? (
                  <span className="font-semibold text-tc-leaf">مجاني</span>
                ) : (
                  formatMoney(shipping)
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-tc-muted">ضريبة القيمة المضافة ({VAT_PERCENT}%)</dt>
              <dd className="tabular">{formatMoney(vat)}</dd>
            </div>
            <div className="flex justify-between border-t border-tc-line pt-2
                            text-base font-extrabold">
              <dt>الإجمالي</dt>
              <dd className="tabular">{formatMoney(total)}</dd>
            </div>
          </dl>

          <p className="text-[11px] leading-relaxed text-tc-muted">
            الإجمالي النهائي يُحتسب على الخادم وقت إتمام الطلب من أسعار الكتالوج.
          </p>

          <Link
            href="/checkout"
            className="block rounded-lg bg-tc-accent py-3 text-center text-sm
                       font-extrabold transition hover:brightness-95"
          >
            إتمام الشراء
          </Link>
        </aside>
      </div>
    </div>
  );
}
