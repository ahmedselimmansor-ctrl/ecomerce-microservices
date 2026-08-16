import Link from 'next/link';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { api } from '@/lib/api';
import { searchResponseSchema, type SearchResponse, type ProductSummary } from '@/lib/schemas';
import { ProductCard } from '@/components/product/ProductCard';
import { FilterSidebar, type FacetBucket } from '@/components/product/FilterSidebar';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const SORTS = [
  { key: 'relevance', label: 'Recommended' },
  { key: 'popularity', label: 'Popularity' },
  { key: 'price_asc', label: 'Price: Low to High' },
  { key: 'price_desc', label: 'Price: High to Low' },
  { key: 'rating', label: 'Rating' },
  { key: 'newest', label: 'New arrivals' },
];

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q : '';
  return {
    title: q ? `${q} — نتائج البحث` : 'البحث',
    // صفحات البحث لا تُفهرَس — محتوى مكرر بلا قيمة لمحركات البحث
    robots: { index: false, follow: true },
  };
}

const EMPTY: SearchResponse = {
  items: [], page: 0, size: 24, totalItems: 0, totalPages: 0, hasNext: false, facets: {},
};

/** نتيجة البحث تأتي بعنوانين (ar/en) — نسطّحها إلى شكل بطاقة المنتج. */
function toSummary(item: SearchResponse['items'][number]): ProductSummary {
  return {
    sku: item.sku,
    slug: item.slug ?? item.sku,
    title: item.titleAr ?? item.titleEn ?? item.sku,
    brandName: item.brandName,
    currency: item.currency,
    priceMinor: item.priceMinor,
    wasMinor: item.wasMinor,
    discountPercent: null,
    image: item.image,
    rating: item.rating,
    ratingCount: item.ratingCount,
    tags: item.tags,
  };
}

function bucketsOf(facets: Record<string, unknown>, key: string): FacetBucket[] {
  const value = facets[key];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (b): b is FacetBucket => typeof b === 'object' && b !== null && 'value' in b && 'count' in b,
  );
}

export default async function SearchPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const str = (k: string) => (typeof params[k] === 'string' ? (params[k] as string) : undefined);

  const q = str('q') ?? '';
  const page = Number(str('page') ?? '0') || 0;
  const sort = str('sort') ?? 'relevance';

  const query = new URLSearchParams({ page: String(page), size: '24', sort });
  if (q) query.set('q', q);
  for (const key of ['category', 'brand', 'tag', 'min_price', 'max_price', 'min_rating'] as const) {
    const value = str(key);
    if (value) query.set(key, value);
  }
  if (str('in_stock') === 'true') query.set('in_stock', 'true');

  let results = EMPTY;
  let failed = false;
  try {
    results = await api.get(`/api/v1/search?${query.toString()}`, searchResponseSchema);
  } catch (error) {
    console.error('search failed', error);
    failed = true;
  }

  const products = results.items.map(toSummary);
  const pageHref = (n: number) => {
    const next = new URLSearchParams(query);
    next.set('page', String(n));
    return `/search?${next.toString()}`;
  };

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-4">
      <nav aria-label="مسار التصفح" className="mb-3 text-[13px] text-noon-muted">
        <Link href="/" className="hover:text-noon-ink">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-noon-ink">{q || 'All products'}</span>
      </nav>

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <Suspense fallback={<div className="skeleton h-96 rounded-lg" />}>
          <FilterSidebar
            brands={bucketsOf(results.facets, 'brand')}
            tags={bucketsOf(results.facets, 'tags')}
            categories={bucketsOf(results.facets, 'category')}
          />
        </Suspense>

        <div className="space-y-4">
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg
                             border border-noon-line bg-white px-4 py-3">
            <div>
              <h1 className="text-[15px] font-bold text-noon-ink">
                {q ? <>Results for &laquo;{q}&raquo;</> : 'All products'}
              </h1>
              {!failed && (
                <p className="text-[13px] text-noon-muted tabular">
                  {results.totalItems} products
                  {results.tookMs != null && <> · {results.tookMs}ms</>}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-noon-muted">Sort by:</span>
              {SORTS.map((option) => {
                const next = new URLSearchParams(query);
                next.set('sort', option.key);
                next.set('page', '0');
                return (
                  <Link
                    key={option.key}
                    href={`/search?${next.toString()}`}
                    className={`rounded-full border px-3 py-1.5 text-[13px] transition
                      ${sort === option.key
                        ? 'border-noon-ink bg-noon-ink text-white'
                        : 'border-noon-line bg-white hover:border-noon-muted'}`}
                  >
                    {option.label}
                  </Link>
                );
              })}
            </div>
          </header>

          {failed ? (
            <div className="rounded-lg border border-noon-line bg-white p-10 text-center">
              <h2 className="text-lg font-bold">البحث غير متاح مؤقتًا</h2>
              <p className="mt-2 text-sm text-noon-muted">يمكنك التصفّح حسب الأقسام في الأثناء.</p>
              <Link
                href="/"
                className="mt-4 inline-flex rounded-lg bg-noon-yellow px-4 py-2 text-sm font-bold"
              >
                العودة للرئيسية
              </Link>
            </div>
          ) : products.length === 0 ? (
            <div className="rounded-lg border border-noon-line bg-white p-10 text-center">
              <h2 className="text-lg font-bold">لم نجد نتائج{q && ` لـ «${q}»`}</h2>
              <p className="mt-2 text-sm text-noon-muted">جرّب كلمات أخرى أو أزل بعض الفلاتر.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {products.map((product, i) => (
                <ProductCard key={product.sku} product={product} priority={i < 5} />
              ))}
            </div>
          )}

          {results.totalPages > 1 && (
            <nav aria-label="التنقل بين الصفحات" className="flex items-center justify-center gap-2">
              {page > 0 && (
                <Link
                  href={pageHref(page - 1)}
                  className="rounded-lg border border-noon-line bg-white px-4 py-2 text-sm"
                >
                  Previous
                </Link>
              )}
              <span className="px-3 text-sm text-noon-muted tabular">
                {page + 1} / {results.totalPages}
              </span>
              {results.hasNext && (
                <Link
                  href={pageHref(page + 1)}
                  className="rounded-lg border border-noon-line bg-white px-4 py-2 text-sm"
                >
                  Next
                </Link>
              )}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
