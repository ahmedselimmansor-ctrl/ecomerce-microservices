'use client';

import Link from 'next/link';
import { Heart, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { useWishlist } from '@/store/wishlist';
import { ProductCard } from '@/components/product/ProductCard';

export default function WishlistPage() {
  const items = useWishlist((s) => s.items);
  const clear = useWishlist((s) => s.clear);

  // zustand/persist يقرأ التخزين بعد الإماهة؛ بدون هذا العلم تومض
  // حالة "فارغة" لجزء من الثانية عند كل تحميل
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-6">
        <div className="skeleton h-64 rounded-lg" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-[1440px] px-4 py-16 text-center">
        <Heart className="mx-auto size-16 text-noon-line" aria-hidden />
        <h1 className="mt-4 text-xl font-extrabold">قائمة المفضّلة فارغة</h1>
        <p className="mt-2 text-sm text-noon-muted">
          اضغط على القلب في أي منتج لحفظه هنا.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-lg bg-noon-yellow px-6 py-2.5 text-sm font-bold"
        >
          تصفّح المنتجات
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-6">
      <header className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-xl font-extrabold sm:text-2xl">
          المفضّلة <span className="text-noon-muted tabular">({items.length})</span>
        </h1>
        <button
          type="button"
          onClick={() => {
            clear();
            toast.success('أُفرغت قائمة المفضّلة');
          }}
          className="flex items-center gap-1.5 rounded-lg border border-noon-line bg-white
                     px-3 py-2 text-sm font-semibold text-noon-red hover:bg-noon-red/5"
        >
          <Trash2 className="size-4" aria-hidden />
          إفراغ القائمة
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
        {items.map((product, i) => (
          <ProductCard key={product.sku} product={product} priority={i < 6} />
        ))}
      </div>
    </div>
  );
}
