'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Heart, Plus, Star, Loader2, Truck, Flame, ShoppingBag, Trophy, Clock, Store } from 'lucide-react';
import { toast } from 'sonner';
import { useCart } from '@/store/cart';
import { useWishlist } from '@/store/wishlist';
import { formatMoney, formatCount, PLACEHOLDER_IMAGE } from '@/lib/format';
import { ApiError } from '@/lib/api';
import type { ProductSummary } from '@/lib/schemas';

interface Props {
  product: ProductSummary;
  priority?: boolean;
  /** إعلان ممول — noon تضع "Ad" أسفل الصورة. */
  sponsored?: boolean;
}

/**
 * بطاقة المنتج.
 *
 * <p>مطابقة لبطاقة noon: شارة أعلى اليسار، قلب أعلى اليمين، زر إضافة سريعة
 * فوق الصورة، تقييم أخضر، سعر ثم سعر مشطوب ثم نسبة الخصم، سطر إشارة
 * (توصيل مجاني / كمية محدودة / ترتيب في الفئة)، وشارة express مائلة.
 */
export function ProductCard({ product, priority = false, sponsored = false }: Props) {
  const [adding, setAdding] = useState(false);
  const addItem = useCart((s) => s.addItem);
  const toggleWishlist = useWishlist((s) => s.toggle);
  const isWishlisted = useWishlist((s) => s.has(product.sku));

  const href = `/product/${product.slug ?? product.sku}`;
  const discount = product.discountPercent ?? null;
  const badge = product.tags.includes('bestseller')
    ? { label: 'Best Seller', className: 'bg-noon-green-dark' }
    : product.tags.includes('official')
      ? { label: 'Official Store', className: 'bg-noon-green-dark' }
      : null;

  async function handleAdd(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setAdding(true);
    try {
      await addItem(product.sku, 1);
      toast.success('أُضيف إلى السلة', { description: product.title });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.userMessage : 'تعذّرت الإضافة للسلة');
    } finally {
      setAdding(false);
    }
  }

  function handleWishlist(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    toggleWishlist(product);
    toast.success(isWishlisted ? 'أُزيل من المفضّلة' : 'أُضيف إلى المفضّلة');
  }

  return (
    <Link
      href={href}
      className="group relative flex flex-col overflow-hidden rounded-lg border border-noon-line
                 bg-white transition hover:shadow-[var(--shadow-noon-hover)]"
    >
      {/* -------------------------------------------------------------- image */}
      <div className="relative aspect-square bg-white">
        {badge && (
          <span
            className={`absolute start-0 top-0 z-10 rounded-ee-lg px-2.5 py-1 text-[11px]
                        font-semibold text-white ${badge.className}`}
          >
            {badge.label}
          </span>
        )}

        <button
          type="button"
          onClick={handleWishlist}
          aria-label={isWishlisted ? 'إزالة من المفضّلة' : 'إضافة إلى المفضّلة'}
          aria-pressed={isWishlisted}
          className="absolute end-2 top-2 z-10 grid size-8 place-items-center rounded-full
                     bg-white/90 text-noon-ink transition hover:bg-white"
        >
          <Heart
            className={`size-[18px] ${isWishlisted ? 'fill-noon-red text-noon-red' : ''}`}
            aria-hidden
          />
        </button>

        <Image
          src={product.image || PLACEHOLDER_IMAGE}
          alt={product.title}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 17vw"
          className="object-contain p-4"
          priority={priority}
          unoptimized={!product.image}
        />

        <button
          type="button"
          onClick={handleAdd}
          disabled={adding}
          aria-label={`أضف ${product.title} إلى السلة`}
          className="absolute bottom-2 end-2 z-10 grid size-8 place-items-center rounded-md
                     border border-noon-line bg-white text-noon-ink transition
                     hover:border-noon-ink active:scale-95 disabled:opacity-60
                     motion-reduce:active:scale-100"
        >
          {adding ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
        </button>
      </div>

      {/* --------------------------------------------------------------- body */}
      <div className="flex flex-1 flex-col gap-1 px-3 pb-2 pt-1">
        {sponsored && <span className="text-[10px] text-noon-muted">Ad</span>}

        <h3 className="line-clamp-2-fixed text-[13px] leading-tight text-noon-ink">
          {product.title}
        </h3>

        {product.rating != null && product.rating > 0 && (
          <div className="flex items-center gap-1 text-[11px]">
            <span
              className={`flex items-center gap-0.5 rounded px-1 py-px font-bold text-white tabular
                ${product.rating >= 4 ? 'bg-noon-green' : 'bg-noon-orange'}`}
            >
              {product.rating.toFixed(1)}
              <Star className="size-2.5 fill-current" aria-hidden />
            </span>
            {product.ratingCount ? (
              <span className="text-noon-muted tabular">({formatCount(product.ratingCount)})</span>
            ) : null}
          </div>
        )}

        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-[11px] font-medium text-noon-ink">{product.currency}</span>
          <span className="text-[17px] font-bold leading-none text-noon-ink tabular">
            {formatMoney(product.priceMinor, product.currency, undefined, false)}
          </span>
          {product.wasMinor && product.wasMinor > product.priceMinor && (
            <>
              <span className="text-[11px] text-noon-muted line-through tabular">
                {formatMoney(product.wasMinor, product.currency, undefined, false)}
              </span>
              {discount ? (
                <span className="text-[11px] font-semibold text-noon-green tabular">
                  {discount}%
                </span>
              ) : null}
            </>
          )}
        </div>

        <SignalLine product={product} />
      </div>

      {/* ------------------------------------------------------------- footer */}
      <div className="flex items-center gap-0 px-3 pb-3">
        {product.tags.includes('market') ? (
          <span className="flex items-center gap-1 rounded bg-[#eaf3ea] px-2 py-0.5
                           text-[10px] font-semibold text-noon-green-dark">
            <Store className="size-3" aria-hidden />
            market
          </span>
        ) : (
          <>
            <span className="badge-skew bg-noon-yellow px-2 py-0.5 text-[11px] font-extrabold
                             italic text-noon-ink">
              <span>express</span>
            </span>
            {product.tags.includes('express') && (
              <span className="badge-skew bg-noon-ink px-2 py-0.5 text-[11px] font-bold
                               italic text-white">
                <span>Tomorrow</span>
              </span>
            )}
          </>
        )}
      </div>
    </Link>
  );
}

/**
 * السطر الإشاري تحت السعر.
 *
 * <p>noon تعرض إشارة واحدة فقط بترتيب أولوية: الندرة تسبق الشعبية تسبق
 * التوصيل. عرض كل الإشارات معًا يُضعف أثرها.
 */
function SignalLine({ product }: { product: ProductSummary }) {
  if (product.tags.includes('low-stock')) {
    return (
      <p className="flex items-center gap-1 text-[11px] text-noon-red">
        <Flame className="size-3 shrink-0" aria-hidden />
        Selling out fast
      </p>
    );
  }
  if (product.tags.includes('lowest-price')) {
    return (
      <p className="flex items-center gap-1 text-[11px] text-noon-red">
        <Clock className="size-3 shrink-0" aria-hidden />
        Lowest price in 30 days
      </p>
    );
  }
  if (product.tags.includes('bestseller')) {
    return (
      <p className="flex items-center gap-1 text-[11px] text-noon-muted">
        <Trophy className="size-3 shrink-0 text-noon-purple" aria-hidden />
        Top rated in category
      </p>
    );
  }
  if (product.tags.includes('trending')) {
    return (
      <p className="flex items-center gap-1 text-[11px] text-noon-muted">
        <ShoppingBag className="size-3 shrink-0 text-noon-green" aria-hidden />
        500+ sold recently
      </p>
    );
  }
  return (
    <p className="flex items-center gap-1 text-[11px] text-noon-muted">
      <Truck className="size-3 shrink-0" aria-hidden />
      Free Delivery
    </p>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-noon-line bg-white">
      <div className="skeleton aspect-square" />
      <div className="space-y-2 p-3">
        <div className="skeleton h-3 w-full rounded" />
        <div className="skeleton h-3 w-2/3 rounded" />
        <div className="skeleton h-4 w-1/2 rounded" />
        <div className="skeleton h-3 w-1/3 rounded" />
      </div>
    </div>
  );
}
