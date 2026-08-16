import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { api, ApiError } from '@/lib/api';
import { pdpResponseSchema, type PdpResponse } from '@/lib/schemas';
import { ProductGrid } from '@/components/product/ProductGrid';
import { ProductDetail } from './ProductDetail';

/** صفحات المنتجات تُعاد صلاحيتها كل 5 دقائق — توازن بين الطزاجة وحمل الخادم. */
export const revalidate = 300;
export const dynamicParams = true;

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function loadProduct(slug: string): Promise<PdpResponse | null> {
  try {
    // نقطة BFF واحدة تجمع المنتج + التوفّر + المشابه + التوصيات
    return await api.get(`/api/v1/bff/pdp/${encodeURIComponent(slug)}`, pdpResponseSchema, {
      revalidate: 300,
      tags: [`product:${slug}`],
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadProduct(slug).catch(() => null);
  if (!data) return { title: 'المنتج غير موجود' };

  const { product } = data;
  return {
    title: product.title,
    description: product.description?.slice(0, 160) ?? product.title,
    openGraph: {
      title: product.title,
      images: product.images.slice(0, 1),
      type: 'website',
    },
    alternates: { canonical: `/product/${product.slug ?? product.sku}` },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const data = await loadProduct(slug);

  if (!data) {
    notFound();
  }

  const { product, availability, similar, recommended } = data;

  // بيانات منظّمة لمحركات البحث — تُظهر السعر والتقييم في نتائج جوجل
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    image: product.images,
    description: product.description ?? undefined,
    sku: product.sku,
    brand: product.brandName ? { '@type': 'Brand', name: product.brandName } : undefined,
    aggregateRating:
      product.rating && product.ratingCount
        ? {
            '@type': 'AggregateRating',
            ratingValue: product.rating,
            reviewCount: product.ratingCount,
          }
        : undefined,
    offers: {
      '@type': 'Offer',
      price: (product.priceMinor / 100).toFixed(2),
      priceCurrency: product.currency,
      availability: availability.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <ProductDetail product={product} availability={availability} />

      {recommended.length > 0 && (
        <ProductGrid
          products={recommended}
          title="يُشترى عادةً معه"
          subtitle="Amazon Personalize"
        />
      )}

      {similar.length > 0 && <ProductGrid products={similar} title="منتجات مشابهة" />}
    </div>
  );
}
