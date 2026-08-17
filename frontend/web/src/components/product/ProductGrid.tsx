import { ProductCard, ProductCardSkeleton } from './ProductCard';
import type { ProductSummary } from '@/lib/schemas';

interface Props {
  products: ProductSummary[];
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
}

export function ProductGrid({ products, title, subtitle, emptyMessage }: Props) {
  if (products.length === 0) {
    return emptyMessage ? (
      <section className="card-tc p-8 text-center text-tc-muted">{emptyMessage}</section>
    ) : null;
  }

  return (
    <section className="space-y-3">
      {title && (
        <header className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-extrabold text-tc-ink sm:text-xl">{title}</h2>
          {subtitle && <p className="text-sm text-tc-muted">{subtitle}</p>}
        </header>
      )}

      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      >
        {products.map((product, index) => (
          <ProductCard
            key={product.sku}
            product={product}
            /* أول صفّ فقط يحمل priority — تحميل كل الصور بأولوية يُبطل الفائدة */
            priority={index < 5}
          />
        ))}
      </div>
    </section>
  );
}

export function ProductGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
