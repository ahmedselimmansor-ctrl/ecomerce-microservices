import Link from 'next/link';
import type { Metadata } from 'next';
import type { z } from 'zod';
import { api } from '@/lib/api';
import { pageResponseSchema, productSummarySchema } from '@/lib/schemas';
import { ProductGrid } from '@/components/product/ProductGrid';

export const revalidate = 120;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const listSchema = pageResponseSchema(productSummarySchema);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `قسم ${slug}`,
    alternates: { canonical: `/category/${slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const page = Number(typeof query.page === 'string' ? query.page : '0') || 0;
  const sort = typeof query.sort === 'string' ? query.sort : '';

  const search = new URLSearchParams({
    category: slug,
    page: String(page),
    size: '24',
  });
  if (sort) search.set('sort', sort);

  let result: z.infer<typeof listSchema> = {
    items: [], page: 0, size: 24, totalItems: 0, totalPages: 0, hasNext: false,
  };
  try {
    result = await api.get(`/api/v1/products?${search.toString()}`, listSchema, {
      revalidate: 120,
      tags: [`category:${slug}`],
    });
  } catch (error) {
    console.error('category load failed', error);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <nav aria-label="مسار التصفح" className="text-sm text-noon-muted">
        <Link href="/" className="hover:text-noon-ink">
          الرئيسية
        </Link>
        <span className="mx-2">/</span>
        <span className="text-noon-ink">{slug}</span>
      </nav>

      <header>
        <h1 className="text-xl font-extrabold sm:text-2xl">{slug}</h1>
        <p className="text-sm text-noon-muted tabular">{result.totalItems} منتج</p>
      </header>

      <div className="flex flex-wrap gap-2">
        {[
          { key: '', label: 'الافتراضي' },
          { key: 'price_asc', label: 'السعر: الأقل' },
          { key: 'price_desc', label: 'السعر: الأعلى' },
          { key: 'rating', label: 'الأعلى تقييمًا' },
          { key: 'newest', label: 'الأحدث' },
        ].map((option) => (
          <Link
            key={option.key || 'default'}
            href={`/category/${slug}${option.key ? `?sort=${option.key}` : ''}`}
            className={`rounded-full border px-3 py-1.5 text-sm transition
              ${sort === option.key
                ? 'border-noon-ink bg-noon-ink text-white'
                : 'border-noon-line bg-white hover:border-noon-muted'}`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <ProductGrid
        products={result.items}
        emptyMessage="لا توجد منتجات في هذا القسم حاليًا."
      />

      {result.totalPages > 1 && (
        <nav className="flex items-center justify-center gap-2 pt-2">
          {page > 0 && (
            <Link
              href={`/category/${slug}?page=${page - 1}${sort ? `&sort=${sort}` : ''}`}
              className="rounded-lg border border-noon-line bg-white px-4 py-2 text-sm"
            >
              السابق
            </Link>
          )}
          <span className="px-3 text-sm text-noon-muted tabular">
            {page + 1} / {result.totalPages}
          </span>
          {result.hasNext && (
            <Link
              href={`/category/${slug}?page=${page + 1}${sort ? `&sort=${sort}` : ''}`}
              className="rounded-lg border border-noon-line bg-white px-4 py-2 text-sm"
            >
              التالي
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
