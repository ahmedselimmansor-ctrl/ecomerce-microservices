import Link from 'next/link';
import { api } from '@/lib/api';
import {
  homeResponseSchema, pageResponseSchema, productSummarySchema,
  type HomeResponse, type ProductSummary,
} from '@/lib/schemas';
import { HeroCarousel } from '@/components/home/HeroCarousel';
import {
  QuickLinks, TripleRow, ProductRail, CategoryTiles, CouponZone,
  OfficialStores, FavouriteBrands, SeoBlock,
} from '@/components/home/HomeSections';
import * as TILES from '@/lib/home-tiles';

/**
 * `force-dynamic` مقصود ولا يعني «بلا كاش»: الصفحة لا تُبنى مسبقًا وقت
 * الـ build (حيث لا وجود للخدمات الخلفية، فينتج HTML فارغ يُخدَم لأول الزوار
 * بعد كل نشر)، بينما نداءات البيانات نفسها مخزَّنة عبر `revalidate` في fetch.
 */
export const dynamic = 'force-dynamic';

const EMPTY: HomeResponse = { categories: [], deals: [], bestsellers: [], forYou: [] };
const listSchema = pageResponseSchema(productSummarySchema);

async function loadHome(): Promise<HomeResponse> {
  try {
    return await api.get('/api/v1/bff/home', homeResponseSchema, { revalidate: 60 });
  } catch (error) {
    // الصفحة الرئيسية يجب أن تُعرض دائمًا؛ سقوط خدمة خلفية لا يعني صفحة خطأ
    console.error('home load failed', error);
    return EMPTY;
  }
}

async function loadCategory(slug: string, size = 12): Promise<ProductSummary[]> {
  try {
    const result = await api.get(
      `/api/v1/products?category=${encodeURIComponent(slug)}&size=${size}`,
      listSchema,
      { revalidate: 120, tags: [`category:${slug}`] },
    );
    return result.items;
  } catch {
    return [];
  }
}

export default async function HomePage() {
  // كل النداءات بالتوازي: التسلسل هنا يعني ثوانٍ إضافية على أول رسم
  const [home, electronics, fashion, home_, beauty, supermarket, automotive] = await Promise.all([
    loadHome(),
    loadCategory('electronics'),
    loadCategory('shoes'),
    loadCategory('home'),
    loadCategory('beauty'),
    loadCategory('supermarket'),
    loadCategory('automotive'),
  ]);

  const isEmpty =
    home.deals.length === 0 && home.bestsellers.length === 0 && home.categories.length === 0;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-4">
      {/* --------------------------------------------------- promo strip */}
      <Link
        href="/category/electronics"
        className="flex flex-wrap items-center justify-center gap-4 rounded-lg bg-[#ff6a13]
                   px-6 py-4 text-white transition hover:brightness-105"
      >
        <span className="text-xl font-extrabold tracking-tight">VALU*</span>
        <span className="text-lg font-bold">50% discount on interest</span>
        <span className="text-sm opacity-90">Up to 60 months</span>
        <span className="rounded bg-white px-3 py-1 text-xs font-extrabold text-[#ff6a13]">
          0% PURCHASE FEES
        </span>
        <span className="rounded bg-white px-3 py-1 text-xs font-extrabold text-[#ff6a13]">
          0% DOWN PAYMENT
        </span>
        <span className="text-xs opacity-80">*T&amp;Cs apply</span>
      </Link>

      <HeroCarousel />
      <QuickLinks />
      <TripleRow />

      {home.forYou.length > 0 && (
        <ProductRail title="Recommended for you" products={home.forYou} href="/search?sort=rating" />
      )}

      {home.bestsellers.length > 0 && (
        <ProductRail
          title={home.forYou.length > 0 ? undefined : 'Recommended for you'}
          products={home.bestsellers}
          banner={{
            title: '40-70% OFF',
            subtitle: 'adidas · Reebok & more',
            cta: 'SHOP NOW',
            href: '/category/shoes',
            className: 'bg-noon-yellow',
          }}
        />
      )}

      <CategoryTiles
        title="Back to school essentials"
        href="/category/stationery"
        tiles={TILES.BACK_TO_SCHOOL}
        className="bg-noon-lilac p-4"
      />

      <CategoryTiles
        title="Automotive sale · 13–15 August"
        href="/category/automotive"
        tiles={TILES.AUTOMOTIVE_TILES}
        className="bg-noon-bg p-4"
      />

      <CouponZone />

      {home.deals.length > 0 && (
        <section className="overflow-hidden rounded-lg bg-noon-ink p-4">
          <h2 className="mb-4 text-center text-3xl font-extrabold text-noon-orange">MEGA DEALS</h2>
          <div className="rounded-lg bg-white p-3">
            <ProductRail products={home.deals} />
          </div>
        </section>
      )}

      <OfficialStores />

      {/* ------------------------------------------------ category sections */}
      <CategoryTiles title="Electronics" href="/category/electronics" tiles={TILES.ELECTRONICS_TILES} />
      <ProductRail title="Electronics picks" products={electronics} href="/category/electronics" />

      <CategoryTiles title="Men's fashion" href="/category/mens-fashion" tiles={TILES.MENS_TILES} className="bg-noon-bg p-4" />
      <CategoryTiles title="Women's fashion" href="/category/womens-fashion" tiles={TILES.WOMENS_TILES} className="bg-noon-bg p-4" />
      <CategoryTiles title="Kids' fashion" href="/category/kids-fashion" tiles={TILES.KIDS_TILES} className="bg-noon-bg p-4" />
      <ProductRail title="Fashion picks" products={fashion} href="/category/shoes" />

      <CategoryTiles title="Beauty" href="/category/beauty" tiles={TILES.BEAUTY_TILES} />
      <ProductRail title="Beauty picks" products={beauty} href="/category/beauty" />

      <CategoryTiles title="Home appliances" href="/category/appliances" tiles={TILES.APPLIANCE_TILES} />
      <CategoryTiles title="Home & kitchen" href="/category/home" tiles={TILES.HOME_TILES} />
      <ProductRail title="Home picks" products={home_} href="/category/home" />

      <CategoryTiles title="Supermarket" href="/category/supermarket" tiles={TILES.SUPERMARKET_TILES} />
      <ProductRail title="Grocery picks" products={supermarket} href="/category/supermarket" />

      <CategoryTiles title="Toys" href="/category/toys" tiles={TILES.TOYS_TILES} />
      <CategoryTiles title="Sports & outdoors" href="/category/sports" tiles={TILES.SPORTS_TILES} />
      <CategoryTiles title="Health & nutrition" href="/category/health" tiles={TILES.HEALTH_TILES} />
      <CategoryTiles title="Stationery" href="/category/stationery" tiles={TILES.STATIONERY_TILES} />
      <ProductRail title="Automotive picks" products={automotive} href="/category/automotive" />

      <FavouriteBrands />
      <SeoBlock />

      {isEmpty && (
        <div className="rounded-lg bg-white p-10 text-center">
          <h2 className="text-lg font-bold">لا توجد منتجات بعد</h2>
          <p className="mt-2 text-sm text-noon-muted">
            شغّل <code className="rounded bg-noon-bg px-1.5 py-0.5">make seed</code> لتحميل
            بيانات تجريبية.
          </p>
        </div>
      )}
    </div>
  );
}
