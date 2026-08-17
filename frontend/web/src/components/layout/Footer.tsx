import Link from 'next/link';
import { Info, Mail, Phone } from 'lucide-react';
import { FOOTER_COLUMNS, POPULAR_SEARCHES } from '@/lib/navigation';
import { Logo } from './Logo';

/**
 * أيقونات الشبكات مرسومة هنا لا مستوردة من lucide.
 * أزالت المكتبة أيقونات العلامات التجارية لأسباب تتعلق بحقوق العلامات،
 * فرسمها محليًا هو الحل الصحيح لا تثبيت نسخة قديمة.
 */
const SOCIALS = [
  {
    label: 'Facebook',
    path: 'M14 9h3V6h-3a4 4 0 0 0-4 4v2H8v3h2v6h3v-6h2.5l.5-3h-3v-2a1 1 0 0 1 1-1Z',
  },
  {
    label: 'X',
    path: 'M4 4h4l4.5 6L17 4h3l-6.2 8.2L20.5 20h-4l-4.8-6.4L6.5 20h-3l6.6-8.6L4 4Z',
  },
  {
    label: 'Instagram',
    path: 'M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H8Zm4 3.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm0 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM17 6.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z',
  },
  {
    label: 'LinkedIn',
    path: 'M5 3.5a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5ZM3.5 9h3v11.5h-3V9Zm5.5 0h2.9v1.6a3.2 3.2 0 0 1 2.9-1.6c3 0 3.7 1.9 3.7 4.5v7h-3v-6.2c0-1.5 0-3.4-2-3.4s-2.4 1.6-2.4 3.3v6.3H9V9Z',
  },
];

const PAYMENT_METHODS = ['Mastercard', 'VISA', 'VALU', 'AMEX', 'CASH'];

export function Footer() {
  return (
    <footer className="mt-8">
      {/* --------------------------------------------------- popular searches */}
      <section className="bg-white px-4 py-5">
        <div className="mx-auto max-w-[1440px]">
          <ul className="flex flex-wrap gap-2">
            {POPULAR_SEARCHES.slice(0, 45).map((term) => (
              <li key={term}>
                <Link
                  href={`/search?q=${encodeURIComponent(term)}`}
                  className="block rounded-full border border-tc-line bg-white px-3 py-1.5
                             text-[13px] text-tc-ink transition hover:border-tc-ink"
                >
                  {term}
                </Link>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-3 text-sm font-semibold text-tc-link hover:underline"
          >
            View More
          </button>
        </div>
      </section>

      {/* -------------------------------------------------------------- help */}
      <section className="border-y border-tc-line bg-tc-bg px-4 py-6">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-6">
          <div>
            <h2 className="text-xl font-extrabold text-tc-ink">We&apos;re Always Here To Help</h2>
            <p className="mt-1 text-sm text-tc-muted">
              Reach out to us through any of these support channels
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-8">
            <SupportChannel icon={Info} label="HELP CENTER" value="help.topchoice.com" />
            <SupportChannel icon={Mail} label="EMAIL SUPPORT" value="support@topchoice.com" />
            <SupportChannel icon={Phone} label="SUPPORT HOURS" value="9am – 11pm, daily" />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- link columns */}
      <section className="bg-white px-4 py-10">
        <div className="mx-auto grid max-w-[1440px] gap-8 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
          {FOOTER_COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h3 className="mb-3 text-sm font-extrabold text-tc-ink">{column.title}</h3>
              <ul className="space-y-2">
                {column.links.map((link) => (
                  <li key={`${column.title}-${link}`}>
                    <Link
                      href={`/category/${column.slug}`}
                      className="text-[13px] text-tc-ink/75 transition hover:text-tc-link"
                    >
                      {link}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* ------------------------------------------------------- app + social */}
        <div className="mx-auto mt-10 flex max-w-[1440px] flex-wrap items-start justify-center
                        gap-12 border-t border-tc-line pt-8">
          <div className="text-center">
            <h3 className="mb-3 text-xs font-extrabold tracking-wide text-tc-ink">
              SHOP ON THE GO
            </h3>
            <div className="flex gap-2">
              <StoreBadge top="Download on the" bottom="App Store" />
              <StoreBadge top="GET IT ON" bottom="Google Play" />
              <StoreBadge top="EXPLORE IT ON" bottom="AppGallery" />
            </div>
          </div>

          <div className="text-center">
            <h3 className="mb-3 text-xs font-extrabold tracking-wide text-tc-ink">
              CONNECT WITH US
            </h3>
            <ul className="flex gap-3">
              {SOCIALS.map((social) => (
                <li key={social.label}>
                  <a
                    href="#"
                    aria-label={social.label}
                    className="grid size-10 place-items-center rounded-full bg-tc-accent
                               text-tc-ink transition hover:brightness-95"
                  >
                    <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
                      <path d={social.path} />
                    </svg>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/*
        الشريط الأخير بترولي غامق كالهيدر — نفس القاعدة لا زخرفة إضافية:
        البترولي يملك الكروم. الصفحة تبدأ وتنتهي به فتُحصر منطقة المنتجات
        البيضاء بينهما، وتبقى الصور أنصع ما فيها.
      */}
      <section className="bg-tc-brand-deep px-4 py-6">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-5">
          <div className="flex flex-wrap items-center gap-4">
            <Logo tone="onDark" />
            <p className="text-[13px] text-white/55">
              © {new Date().getFullYear()} TopChoice. All Rights Reserved
            </p>
          </div>

          <ul className="flex flex-wrap items-center gap-2">
            {PAYMENT_METHODS.map((method) => (
              <li
                key={method}
                className="rounded border border-white/20 bg-white/10 px-2.5 py-1.5
                           text-[10px] font-bold text-white/85"
              >
                {method}
              </li>
            ))}
          </ul>

          <ul className="flex flex-wrap items-center gap-4 text-[13px] text-white/70">
            {['Careers', 'Warranty Policy', 'Sell with us', 'Terms of Use',
              'Terms of Sale', 'Privacy Policy'].map((item) => (
              <li key={item}>
                <a href="#" className="transition hover:text-tc-accent">
                  {item}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </footer>
  );
}

function SupportChannel({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Info;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 place-items-center rounded-full border border-tc-line bg-white">
        <Icon className="size-4 text-tc-ink" aria-hidden />
      </span>
      <span>
        <span className="block text-[11px] font-semibold text-tc-muted">{label}</span>
        <span className="block text-[15px] font-bold text-tc-ink">{value}</span>
      </span>
    </div>
  );
}

function StoreBadge({ top, bottom }: { top: string; bottom: string }) {
  return (
    <span className="flex flex-col rounded-md bg-tc-ink px-3 py-1.5 text-white">
      <span className="text-[8px] leading-tight">{top}</span>
      <span className="text-[13px] font-bold leading-tight">{bottom}</span>
    </span>
  );
}
