'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Star, ShoppingCart, Loader2, Truck, ShieldCheck, RotateCcw } from 'lucide-react';
import { useCart } from '@/store/cart';
import { api, ApiError } from '@/lib/api';
import { formatMoney, formatNumber, PLACEHOLDER_IMAGE } from '@/lib/format';
import { z } from 'zod';
import type { PdpResponse } from '@/lib/schemas';

type Props = Pick<PdpResponse, 'product' | 'availability'>;

export function ProductDetail({ product, availability }: Props) {
  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const addItem = useCart((s) => s.addItem);

  /** تسجيل المشاهدة يغذّي Amazon Personalize — يُرسل مرة واحدة لكل منتج. */
  useEffect(() => {
    void api
      .post('/api/v1/bff/track', z.unknown(), {
        eventType: 'view',
        sku: product.sku,
      })
      .catch(() => undefined);
  }, [product.sku]);

  const images = product.images.length > 0 ? product.images : [PLACEHOLDER_IMAGE];
  const maxQuantity = Math.min(20, Math.max(availability.available || 20, 1));

  async function handleAdd() {
    setAdding(true);
    try {
      await addItem(product.sku, quantity);
      toast.success('أُضيف إلى السلة', { description: `${product.title} × ${quantity}` });
      void api
        .post('/api/v1/bff/track', z.unknown(), {
          eventType: 'add_to_cart',
          sku: product.sku,
        })
        .catch(() => undefined);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.userMessage : 'تعذّرت الإضافة للسلة');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* ------------------------------------------------------------ gallery */}
      <div className="card-noon grid gap-4 p-4 sm:grid-cols-[80px_minmax(0,1fr)]">
        <div className="order-2 flex gap-2 overflow-x-auto sm:order-1 sm:flex-col sm:overflow-visible">
          {images.map((src, index) => (
            <button
              key={src + index}
              type="button"
              onClick={() => setActiveImage(index)}
              aria-label={`صورة ${index + 1}`}
              aria-current={index === activeImage}
              className={`relative size-16 shrink-0 overflow-hidden rounded-lg border-2 transition
                ${index === activeImage ? 'border-noon-ink' : 'border-noon-line'}`}
            >
              <Image
                src={src}
                alt=""
                fill
                sizes="64px"
                className="object-contain p-1"
                unoptimized={src.startsWith('data:')}
              />
            </button>
          ))}
        </div>

        <div className="order-1 sm:order-2">
          <div className="relative aspect-square w-full">
            <Image
              src={images[activeImage] ?? PLACEHOLDER_IMAGE}
              alt={product.title}
              fill
              sizes="(max-width: 1024px) 100vw, 640px"
              className="object-contain"
              priority
              unoptimized={(images[activeImage] ?? '').startsWith('data:')}
            />
          </div>
        </div>
      </div>

      {/* --------------------------------------------------------------- info */}
      <div className="space-y-4">
        <div className="card-noon space-y-3 p-4">
          {product.brandName && (
            <span className="text-sm font-semibold text-noon-blue">{product.brandName}</span>
          )}

          <h1 className="text-xl font-extrabold leading-snug sm:text-2xl">{product.title}</h1>

          {product.rating != null && product.rating > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="flex items-center gap-1 rounded bg-noon-green/10 px-2 py-0.5
                               font-bold text-noon-green tabular">
                {product.rating.toFixed(1)}
                <Star className="size-3.5 fill-current" aria-hidden />
              </span>
              {product.ratingCount ? (
                <span className="text-noon-muted tabular">
                  {formatNumber(product.ratingCount)} تقييم
                </span>
              ) : null}
            </div>
          )}

          <div className="flex items-end gap-3 border-t border-noon-line pt-3">
            <span className="text-2xl font-extrabold tabular">
              {formatMoney(product.priceMinor, product.currency)}
            </span>
            {product.wasMinor && product.wasMinor > product.priceMinor && (
              <>
                <span className="text-sm text-noon-muted line-through tabular">
                  {formatMoney(product.wasMinor, product.currency)}
                </span>
                {product.discountPercent ? (
                  <span className="rounded bg-noon-red px-2 py-0.5 text-xs font-bold text-white tabular">
                    وفّر {product.discountPercent}%
                  </span>
                ) : null}
              </>
            )}
          </div>

          {/* حالة المخزون: نعرض إشارة لا رقمًا دقيقًا */}
          {availability.inStock ? (
            availability.lowStock ? (
              <p className="text-sm font-semibold text-noon-red">
                الكمية محدودة — سارع بالطلب
              </p>
            ) : (
              <p className="text-sm font-semibold text-noon-green">متوفر</p>
            )
          ) : (
            <p className="text-sm font-semibold text-noon-muted">غير متوفر حاليًا</p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <label htmlFor="qty" className="text-sm text-noon-muted">
              الكمية
            </label>
            <select
              id="qty"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              disabled={!availability.inStock}
              className="rounded-lg border border-noon-line bg-white px-3 py-2 text-sm tabular"
            >
              {Array.from({ length: maxQuantity }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleAdd}
            disabled={adding || !availability.inStock}
            className="flex w-full items-center justify-center gap-2 rounded-lg
                       bg-noon-yellow py-3 text-sm font-extrabold text-noon-ink
                       transition hover:brightness-95 active:scale-[0.99]
                       disabled:cursor-not-allowed disabled:opacity-50
                       motion-reduce:active:scale-100"
          >
            {adding ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <ShoppingCart className="size-4" aria-hidden />
            )}
            {availability.inStock ? 'أضف إلى السلة' : 'غير متوفر'}
          </button>
        </div>

        <ul className="card-noon divide-y divide-noon-line text-sm">
          <li className="flex items-center gap-3 p-3">
            <Truck className="size-5 shrink-0 text-noon-blue" aria-hidden />
            <span>توصيل خلال 24 ساعة داخل المدن الرئيسية</span>
          </li>
          <li className="flex items-center gap-3 p-3">
            <RotateCcw className="size-5 shrink-0 text-noon-blue" aria-hidden />
            <span>إرجاع مجاني خلال 15 يومًا</span>
          </li>
          <li className="flex items-center gap-3 p-3">
            <ShieldCheck className="size-5 shrink-0 text-noon-blue" aria-hidden />
            <span>ضمان المنتج الأصلي</span>
          </li>
        </ul>

        {Object.keys(product.attributes).length > 0 && (
          <div className="card-noon p-4">
            <h2 className="mb-3 text-sm font-bold">المواصفات</h2>
            <dl className="divide-y divide-noon-line text-sm">
              {Object.entries(product.attributes).map(([key, value]) => (
                <div key={key} className="flex justify-between gap-4 py-2">
                  <dt className="text-noon-muted">{key}</dt>
                  <dd className="font-medium">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {product.description && (
          <div className="card-noon p-4">
            <h2 className="mb-2 text-sm font-bold">عن المنتج</h2>
            <p className="text-sm leading-relaxed text-noon-ink/80">{product.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}
