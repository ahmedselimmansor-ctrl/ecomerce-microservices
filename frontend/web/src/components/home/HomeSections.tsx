import Image from 'next/image';
import Link from 'next/link';
import { Carousel } from './Carousel';
import { ProductCard } from '@/components/product/ProductCard';
import { QUICK_LINKS, FAVOURITE_BRANDS } from '@/lib/navigation';
import type { ProductSummary } from '@/lib/schemas';

/* ========================================================================== */
/*  عنوان قسم + زر VIEW ALL                                                    */
/* ========================================================================== */

export function SectionHeader({
  title,
  href,
  cta = 'VIEW ALL',
}: {
  title: string;
  href?: string;
  cta?: string;
}) {
  return (
    <header className="mb-3 flex items-center justify-between gap-4">
      <h2 className="text-xl font-extrabold text-noon-ink sm:text-2xl">{title}</h2>
      {href && (
        <Link
          href={href}
          className="shrink-0 rounded border border-noon-ink/20 px-4 py-2 text-[13px]
                     font-bold text-noon-ink transition hover:border-noon-ink"
        >
          {cta}
        </Link>
      )}
    </header>
  );
}

/* ========================================================================== */
/*  دوائر الأقسام السريعة                                                       */
/* ========================================================================== */

export function QuickLinks() {
  return (
    <Carousel>
      {QUICK_LINKS.map((link) => (
        <Link
          key={link.label}
          href={link.href}
          className="flex w-[104px] shrink-0 flex-col items-center gap-2 sm:w-[120px]"
        >
          <span className="relative aspect-square w-full overflow-hidden rounded-lg bg-white">
            <Image
              src={link.image}
              alt=""
              fill
              sizes="120px"
              className="object-cover transition group-hover:scale-105"
            />
          </span>
          <span className="text-center text-[13px] font-semibold leading-tight text-noon-ink">
            {link.label}
          </span>
        </Link>
      ))}
    </Carousel>
  );
}

/* ========================================================================== */
/*  الصف الثلاثي: More reasons · Mega deals · In focus                         */
/* ========================================================================== */

const REASONS = [
  { title: 'Local finds', subtitle: 'Hand-picked brands, locally', href: '/category/supermarket', bg: 'bg-[#d8f3e6]' },
  { title: 'Bestsellers', subtitle: 'Fill your basket', href: '/search?sort=rating', bg: 'bg-[#fdf3c8]' },
  { title: 'Top-rated products', subtitle: 'Stay in trend', href: '/search?sort=rating', bg: 'bg-[#fde2e4]' },
  { title: 'New arrivals', subtitle: 'Fresh takes you need', href: '/search?sort=newest', bg: 'bg-[#e4e9fd]' },
];

const MEGA_DEALS = [
  { label: 'Fashion deals', title: 'Sports shoes', offer: 'Up to 65% off', href: '/category/shoes' },
  { label: 'Home deals', title: 'Desks, desk chairs & more', offer: 'Up to 20% off', href: '/category/home' },
  { label: 'Supermarket deals', title: 'Tissues & wipes', offer: 'Up to 20% off', href: '/category/supermarket' },
  { label: 'TV deals', title: 'Smart televisions', offer: 'Up to 35% off', href: '/category/tv' },
];

export function TripleRow() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* -------------------------------------------------- more reasons */}
      <section>
        <h2 className="mb-3 text-xl font-extrabold text-noon-ink">More reasons to shop</h2>
        <div className="grid grid-cols-2 gap-3">
          {REASONS.map((reason) => (
            <Link
              key={reason.title}
              href={reason.href}
              className={`flex min-h-[132px] flex-col justify-end rounded-lg p-4 transition
                          hover:shadow-[var(--shadow-noon-hover)] ${reason.bg}`}
            >
              <span className="text-[15px] font-extrabold text-noon-ink">{reason.title}</span>
              <span className="text-[13px] text-noon-ink/70">{reason.subtitle}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------- mega deals */}
      <section className="rounded-lg bg-noon-lilac p-4">
        <h2 className="mb-3 text-xl font-extrabold text-noon-ink">Mega deals</h2>
        <div className="grid grid-cols-2 gap-3">
          {MEGA_DEALS.map((deal) => (
            <Link
              key={deal.title}
              href={deal.href}
              className="relative flex min-h-[132px] flex-col justify-end rounded-lg bg-white p-3
                         transition hover:shadow-[var(--shadow-noon-hover)]"
            >
              <span className="absolute end-0 top-0 rounded-bl-lg rounded-tr-lg bg-noon-purple
                               px-2 py-1 text-[10px] font-bold text-white">
                {deal.label}
              </span>
              <span className="text-[12px] text-noon-ink/70">{deal.title}</span>
              <span className="text-[15px] font-extrabold text-noon-ink">{deal.offer}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------- in focus */}
      <section>
        <h2 className="mb-3 text-xl font-extrabold text-noon-ink">In focus</h2>
        <div className="grid gap-3">
          <Link
            href="/category/automotive"
            className="flex min-h-[132px] flex-col justify-center rounded-lg px-6
                       text-white transition hover:brightness-110"
            style={{ background: 'linear-gradient(100deg,#3a3226 0%,#7a6444 60%,#c9a227 100%)' }}
          >
            <span className="text-2xl font-extrabold leading-tight">ONE STOP FOR ALL TYRES,</span>
            <span className="text-lg font-bold">FIND YOUR PERFECT FIT!</span>
          </Link>
          <Link
            href="/category/beauty"
            className="flex min-h-[132px] flex-col justify-center rounded-lg px-6
                       text-white transition hover:brightness-110"
            style={{ background: 'linear-gradient(100deg,#0d2a5e 0%,#1c4fa1 60%,#3a86e8 100%)' }}
          >
            <span className="text-xl font-extrabold leading-tight">SUN PROTECTION</span>
            <span className="text-sm">Dermatologist recommended skincare</span>
          </Link>
        </div>
      </section>
    </div>
  );
}

/* ========================================================================== */
/*  شريط منتجات                                                                */
/* ========================================================================== */

export function ProductRail({
  title,
  products,
  href,
  cta,
  /** خلفية ملوّنة كما في شريط adidas الأصفر. */
  banner,
}: {
  title?: string;
  products: ProductSummary[];
  href?: string;
  cta?: string;
  banner?: { title: string; subtitle: string; cta: string; href: string; className: string };
}) {
  if (products.length === 0) return null;

  return (
    <section className={banner ? 'overflow-hidden rounded-lg' : ''}>
      {banner && (
        <Link
          href={banner.href}
          className={`flex flex-wrap items-center justify-between gap-4 px-6 py-6 ${banner.className}`}
        >
          <span>
            <span className="block text-lg font-extrabold text-noon-ink">{banner.subtitle}</span>
            <span className="block text-3xl font-extrabold text-noon-red sm:text-4xl">
              {banner.title}
            </span>
          </span>
          <span className="rounded-md bg-noon-ink px-8 py-3 text-sm font-extrabold text-white">
            {banner.cta}
          </span>
        </Link>
      )}

      {title && <SectionHeader title={title} href={href} cta={cta} />}

      <div className={banner ? 'px-3 pb-3' : ''}>
        <Carousel>
          {products.map((product, i) => (
            <div key={product.sku} className="w-[168px] shrink-0 sm:w-[196px]">
              <ProductCard product={product} priority={i < 4} sponsored={i === 4} />
            </div>
          ))}
        </Carousel>
      </div>
    </section>
  );
}

/* ========================================================================== */
/*  بلاطات أقسام فرعية داخل قسم كبير                                            */
/* ========================================================================== */

export function CategoryTiles({
  title,
  href,
  tiles,
  className = '',
}: {
  title: string;
  href: string;
  tiles: { label: string; slug: string; image: string }[];
  className?: string;
}) {
  return (
    <section className={`rounded-lg ${className}`}>
      <SectionHeader title={title} href={href} />
      <Carousel>
        {tiles.map((tile) => (
          <Link
            key={`${title}-${tile.label}`}
            href={`/category/${tile.slug}`}
            className="flex w-[136px] shrink-0 flex-col items-center gap-2 sm:w-[176px]"
          >
            <span className="relative aspect-square w-full overflow-hidden rounded-2xl bg-white">
              <Image src={tile.image} alt="" fill sizes="176px" className="object-cover" />
            </span>
            <span className="text-center text-[15px] font-bold leading-tight text-noon-ink">
              {tile.label}
            </span>
          </Link>
        ))}
      </Carousel>
    </section>
  );
}

/* ========================================================================== */
/*  منطقة الكوبونات                                                            */
/* ========================================================================== */

const COUPONS = [
  { code: 'OIL250', title: 'Oils & fluids', offer: 'GET 5% OFF', note: 'Get up to 250 EGP', href: '/category/automotive' },
  { code: 'TYRES', title: 'Tyres', offer: 'GET 5% OFF', note: 'Up to 2,000 EGP', href: '/category/automotive' },
  { code: 'CHARGE1000', title: 'EV chargers', offer: 'GET 1,000 EGP OFF', note: '', href: '/category/automotive' },
  { code: 'CAR500', title: 'Car electronics', offer: 'GET 500 EGP OFF', note: '', href: '/category/automotive' },
  { code: 'NOON10', title: 'Everything', offer: 'GET 10% OFF', note: 'On your first order', href: '/' },
];

export function CouponZone() {
  return (
    <section>
      <h2 className="mb-4 text-center text-2xl font-extrabold tracking-tight">
        <span className="text-noon-orange">COUPON</span>{' '}
        <span className="text-noon-ink">ZONE</span>
      </h2>

      <Carousel>
        {COUPONS.map((coupon) => (
          <Link
            key={coupon.code}
            href={coupon.href}
            className="relative w-[260px] shrink-0 overflow-hidden rounded-lg border
                       border-noon-line bg-white p-4 pt-8 transition
                       hover:shadow-[var(--shadow-noon-hover)]"
          >
            <span className="absolute start-0 top-2 rounded-e-full bg-noon-red px-3 py-1
                             text-[12px] font-bold text-white">
              Use code: <span className="font-extrabold">{coupon.code}</span>
            </span>
            <span className="mt-3 block text-[15px] font-semibold text-noon-ink">
              {coupon.title}
            </span>
            <span className="mt-2 block text-2xl font-extrabold leading-tight text-noon-red">
              {coupon.offer}
            </span>
            {coupon.note && (
              <span className="mt-1 block text-[13px] text-noon-muted">{coupon.note}</span>
            )}
          </Link>
        ))}
      </Carousel>
    </section>
  );
}

/* ========================================================================== */
/*  المتاجر الرسمية والعلامات                                                   */
/* ========================================================================== */

const OFFICIAL_STORES = [
  'BergHOFF', 'Kérastase', 'adidas', 'TANK', 'Vivo', 'Oraimo',
  'Mercusys', 'trendyol', 'YSL', 'Bosch', 'Happy Vision', 'TP-Link',
];

export function OfficialStores() {
  return (
    <section>
      <h2 className="mb-4 text-2xl font-extrabold tracking-tight text-noon-ink">
        OFFICIAL BRAND STORES
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {OFFICIAL_STORES.map((brand) => (
          <Link
            key={brand}
            href={`/search?q=${encodeURIComponent(brand)}`}
            className="flex items-stretch overflow-hidden rounded-lg border border-noon-line
                       bg-white transition hover:shadow-[var(--shadow-noon-hover)]"
          >
            <span className="grid w-[84px] shrink-0 place-items-center bg-noon-ink px-2
                             text-center text-[13px] font-extrabold text-white">
              {brand.slice(0, 9)}
            </span>
            <span className="flex flex-col justify-center px-3 py-3">
              <span className="text-[15px] font-semibold text-noon-ink">{brand}</span>
              <span className="text-[13px] font-medium text-noon-blue">Visit the store ›</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function FavouriteBrands() {
  return (
    <section className="rounded-lg bg-noon-bg py-8">
      <h2 className="mb-6 text-center text-3xl font-normal text-noon-ink">
        Your favorite <span className="font-extrabold">brands</span>
      </h2>
      <div className="mx-auto grid max-w-[1300px] grid-cols-3 gap-3 px-4 sm:grid-cols-5 lg:grid-cols-7">
        {FAVOURITE_BRANDS.slice(0, 21).map((brand) => (
          <Link
            key={brand}
            href={`/search?q=${encodeURIComponent(brand)}`}
            className="grid h-[104px] place-items-center rounded-xl border border-noon-line
                       bg-white px-3 text-center text-[15px] font-extrabold text-noon-ink
                       shadow-sm transition hover:shadow-[var(--shadow-noon-hover)]"
          >
            {brand}
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ========================================================================== */
/*  نص السيو                                                                   */
/* ========================================================================== */

export function SeoBlock() {
  return (
    <section className="rounded-lg bg-white p-5 text-[13px] leading-relaxed text-noon-ink/80">
      <h2 className="mb-2 text-[15px] font-bold text-noon-ink">
        Superior online shopping in Egypt
      </h2>
      <p>
        Offering a world-class customer experience, noon is the top choice for online shopping in
        Egypt. From <Link href="/category/electronics" className="text-noon-blue">electronics products</Link>{' '}
        to fashion, kids&apos; toys,{' '}
        <Link href="/category/baby" className="text-noon-blue">baby products</Link>, homeware,
        furniture, sporting and outdoor products,{' '}
        <Link href="/category/beauty" className="text-noon-blue">beauty products</Link>, books and
        stationery, groceries, and much, much more — the noon Egypt store has millions of authentic
        products. As a customer-centric store, we are committed to providing our customers with
        authentic products, top brands, and long-term quality.
      </p>
      <h3 className="mb-2 mt-4 text-[15px] font-bold text-noon-ink">
        Shop the best products &amp; top brands at noon Egypt
      </h3>
      <p>
        If you&apos;re looking for a wide range of products from top brands, noon Egypt has you
        covered. In our electronics department, you&apos;ll find{' '}
        <Link href="/category/mobiles" className="text-noon-blue">mobile phones</Link>, wireless and
        in-ear <Link href="/category/audio" className="text-noon-blue">headsets</Link>,{' '}
        <Link href="/category/laptops" className="text-noon-blue">laptops</Link> and accessories,
        wearable devices, smartwatches,{' '}
        <Link href="/category/tv" className="text-noon-blue">TVs</Link>, and a variety of{' '}
        <Link href="/category/gaming" className="text-noon-blue">video games</Link>.
      </p>
    </section>
  );
}
