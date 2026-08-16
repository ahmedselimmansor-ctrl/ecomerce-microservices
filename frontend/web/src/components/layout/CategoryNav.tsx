'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRef, useState } from 'react';
import { NAV, type NavCategory } from '@/lib/navigation';

/**
 * شريط الأقسام مع القائمة الكبيرة (mega menu).
 *
 * <p>تفصيلتان تُحدثان فرقًا في الاستخدام الفعلي:
 * (1) تأخير 120ms قبل الإغلاق — بدونه تُغلق القائمة أثناء تحريك المؤشر
 *     قطريًا نحو عنصر داخلها.
 * (2) الفتح بالتحويم <b>و</b> بالتركيز، فتعمل بلوحة المفاتيح أيضًا.
 */
export function CategoryNav() {
  const [active, setActive] = useState<NavCategory | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openMenu = (category: NavCategory) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setActive(category);
  };

  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setActive(null), 120);
  };

  return (
    <div
      className="relative border-b border-noon-line bg-white"
      onMouseLeave={scheduleClose}
    >
      <nav className="mx-auto max-w-[1440px] px-4" aria-label="أقسام المتجر">
        <ul className="scrollbar-none flex items-center gap-6 overflow-x-auto">
          {NAV.map((category) => (
            <li key={category.slug} className="shrink-0">
              <Link
                href={`/category/${category.slug}`}
                onMouseEnter={() => openMenu(category)}
                onFocus={() => openMenu(category)}
                className={`block whitespace-nowrap border-b-2 py-3 text-[15px] font-semibold
                  transition-colors
                  ${active?.slug === category.slug
                    ? 'border-noon-ink text-noon-ink'
                    : 'border-transparent text-noon-ink hover:text-noon-blue'}`}
              >
                {category.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {active && (
        <div
          className="absolute inset-x-0 top-full z-40 border-b border-noon-line bg-white shadow-lg"
          onMouseEnter={() => openMenu(active)}
        >
          <div className="mx-auto grid max-w-[1440px] gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div>
              <div
                className="grid gap-x-6 gap-y-4"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(active.columns.length, 6)}, minmax(0, 1fr))`,
                }}
              >
                {active.columns.map((column) => (
                  <div key={column.title}>
                    <h3 className="mb-3 text-[13px] font-extrabold uppercase tracking-wide text-noon-ink">
                      {column.title}
                    </h3>
                    <ul className="space-y-2">
                      {column.links.map((link) => (
                        <li key={`${column.title}-${link.label}`}>
                          <Link
                            href={`/category/${link.slug}`}
                            onClick={() => setActive(null)}
                            className="block truncate text-[13px] text-noon-ink/80 hover:text-noon-blue"
                          >
                            {link.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              {active.brands.length > 0 && (
                <div className="mt-8">
                  <h3 className="mb-3 text-[13px] font-extrabold uppercase tracking-wide text-noon-ink">
                    Top Brands
                  </h3>
                  <ul className="flex flex-wrap gap-2">
                    {active.brands.map((brand) => (
                      <li key={brand}>
                        <Link
                          href={`/search?q=${encodeURIComponent(brand)}`}
                          onClick={() => setActive(null)}
                          className="grid h-11 min-w-[88px] place-items-center rounded-md
                                     border border-noon-line bg-noon-bg px-3 text-[11px]
                                     font-bold text-noon-ink transition hover:border-noon-ink"
                        >
                          {brand}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <Link
              href={active.promo.href}
              onClick={() => setActive(null)}
              className="relative hidden aspect-[4/3] overflow-hidden rounded-lg bg-noon-bg lg:block"
            >
              <Image
                src={active.promo.image}
                alt={active.label}
                fill
                sizes="380px"
                className="object-cover"
              />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
