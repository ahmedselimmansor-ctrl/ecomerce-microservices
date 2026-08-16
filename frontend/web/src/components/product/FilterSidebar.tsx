'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Star } from 'lucide-react';

export interface FacetBucket {
  value: string;
  count: number;
}

interface Props {
  brands?: FacetBucket[];
  tags?: FacetBucket[];
  categories?: FacetBucket[];
}

const PRICE_BANDS = [
  { label: 'Under 100', min: 0, max: 10_000 },
  { label: '100 – 500', min: 10_000, max: 50_000 },
  { label: '500 – 1,000', min: 50_000, max: 100_000 },
  { label: '1,000 – 5,000', min: 100_000, max: 500_000 },
  { label: 'Over 5,000', min: 500_000, max: undefined },
];

/**
 * الفلاتر الجانبية.
 *
 * <p>الحالة في الـ URL لا في React: الرابط المفلتَر قابل للمشاركة والحفظ،
 * وزر الرجوع في المتصفح يعمل كما يتوقّع المستخدم. هذا هو السبب الحقيقي
 * لتفضيل الروابط على مربّعات اختيار تُدار بالحالة.
 */
export function FilterSidebar({ brands = [], tags = [], categories = [] }: Props) {
  const pathname = usePathname();
  const params = useSearchParams();

  const buildHref = (key: string, value: string | null, extra?: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    for (const [k, v] of Object.entries(extra ?? {})) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    next.delete('page');
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const activeBrand = params.get('brand');
  const activeRating = params.get('min_rating');
  const activeMin = params.get('min_price');
  const inStock = params.get('in_stock') === 'true';
  const hasFilters = Boolean(activeBrand || activeRating || activeMin || inStock);

  return (
    <aside className="space-y-3">
      {hasFilters && (
        <Link
          href={pathname}
          className="block rounded-lg border border-noon-line bg-white px-4 py-2.5
                     text-center text-sm font-bold text-noon-blue"
        >
          مسح كل الفلاتر
        </Link>
      )}

      {categories.length > 0 && (
        <FilterGroup title="Category">
          {categories.slice(0, 10).map((bucket) => (
            <FilterRow
              key={bucket.value}
              href={buildHref('category', bucket.value)}
              label={bucket.value}
              count={bucket.count}
              active={params.get('category') === bucket.value}
            />
          ))}
        </FilterGroup>
      )}

      {brands.length > 0 && (
        <FilterGroup title="Brand">
          {brands.slice(0, 12).map((bucket) => (
            <FilterRow
              key={bucket.value}
              href={buildHref('brand', activeBrand === bucket.value ? null : bucket.value)}
              label={bucket.value}
              count={bucket.count}
              active={activeBrand === bucket.value}
            />
          ))}
        </FilterGroup>
      )}

      <FilterGroup title="Price">
        {PRICE_BANDS.map((band) => {
          const active = activeMin === String(band.min);
          return (
            <FilterRow
              key={band.label}
              href={buildHref('min_price', active ? null : String(band.min), {
                max_price: active || band.max === undefined ? null : String(band.max),
              })}
              label={`EGP ${band.label}`}
              active={active}
            />
          );
        })}
      </FilterGroup>

      <FilterGroup title="Rating">
        {[4, 3, 2].map((rating) => {
          const active = activeRating === String(rating);
          return (
            <Link
              key={rating}
              href={buildHref('min_rating', active ? null : String(rating))}
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm transition
                ${active ? 'bg-noon-bg font-semibold' : 'hover:bg-noon-bg'}`}
            >
              <span className="flex">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star
                    key={i}
                    className={`size-3.5 ${i < rating ? 'fill-noon-orange text-noon-orange' : 'text-noon-line'}`}
                    aria-hidden
                  />
                ))}
              </span>
              <span className="text-noon-muted">&amp; up</span>
            </Link>
          );
        })}
      </FilterGroup>

      <FilterGroup title="Availability">
        <FilterRow
          href={buildHref('in_stock', inStock ? null : 'true')}
          label="In stock only"
          active={inStock}
        />
      </FilterGroup>

      {tags.length > 0 && (
        <FilterGroup title="Offers">
          {tags.slice(0, 8).map((bucket) => (
            <FilterRow
              key={bucket.value}
              href={buildHref('tag', params.get('tag') === bucket.value ? null : bucket.value)}
              label={bucket.value}
              count={bucket.count}
              active={params.get('tag') === bucket.value}
            />
          ))}
        </FilterGroup>
      )}
    </aside>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-noon-line bg-white p-3">
      <h3 className="mb-2 text-sm font-extrabold text-noon-ink">{title}</h3>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function FilterRow({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count?: number;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm transition
        ${active ? 'bg-noon-bg font-semibold text-noon-ink' : 'text-noon-ink/80 hover:bg-noon-bg'}`}
    >
      <span className="flex items-center gap-2 truncate">
        <span
          className={`grid size-4 shrink-0 place-items-center rounded border
            ${active ? 'border-noon-blue bg-noon-blue' : 'border-noon-line'}`}
        >
          {active && <span className="size-1.5 rounded-sm bg-white" />}
        </span>
        <span className="truncate">{label}</span>
      </span>
      {count != null && <span className="shrink-0 text-xs text-noon-muted tabular">({count})</span>}
    </Link>
  );
}
