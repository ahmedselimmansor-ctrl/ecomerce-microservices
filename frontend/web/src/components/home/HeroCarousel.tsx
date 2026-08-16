'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Slide {
  id: string;
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  /** تدرّج CSS بدل صورة — يتجنّب اعتمادًا على أصول خارجية قد تختفي. */
  gradient: string;
  accent: string;
}

const SLIDES: Slide[] = [
  {
    id: 'automotive',
    title: 'UP TO 60% OFF',
    subtitle: 'All your automotive needs at a discount',
    cta: 'SHOP NOW',
    href: '/category/automotive',
    gradient: 'linear-gradient(100deg,#0b0b0d 0%,#0b0b0d 42%,#b8410c 68%,#f0850f 100%)',
    accent: '#feee00',
  },
  {
    id: 'coffee',
    title: 'Coffee, your way',
    subtitle: 'From bean to brew',
    cta: 'SHOP NOW',
    href: '/category/supermarket',
    gradient: 'linear-gradient(100deg,#8a5a2b 0%,#c08a4f 55%,#e0b183 100%)',
    accent: '#ffffff',
  },
  {
    id: 'electronics',
    title: 'THE TECH SALE',
    subtitle: 'Laptops, phones and wearables — up to 45% off',
    cta: 'SHOP NOW',
    href: '/category/electronics',
    gradient: 'linear-gradient(100deg,#0f1b3d 0%,#1e3a8a 55%,#3866df 100%)',
    accent: '#feee00',
  },
  {
    id: 'beauty',
    title: 'GLOW SEASON',
    subtitle: 'Skincare and fragrance picks for summer',
    cta: 'SHOP NOW',
    href: '/category/beauty',
    gradient: 'linear-gradient(100deg,#7a1b4d 0%,#c2418a 55%,#f7a6c8 100%)',
    accent: '#ffffff',
  },
];

const INTERVAL_MS = 6_000;

export function HeroCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = useCallback((next: number) => {
    setIndex((next + SLIDES.length) % SLIDES.length);
  }, []);

  /** التقدّم التلقائي يتوقف عند التحويم — لا نسحب الشريحة من تحت المستخدم. */
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => go(index + 1), INTERVAL_MS);
    return () => clearInterval(timer);
  }, [index, paused, go]);

  const slide = SLIDES[index]!;

  return (
    <section
      className="relative overflow-hidden rounded-lg"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="عروض مميزة"
    >
      <Link
        href={slide.href}
        className="relative flex min-h-[240px] items-center px-8 py-12 sm:min-h-[340px] sm:px-14"
        style={{ background: slide.gradient }}
      >
        <div className="max-w-lg">
          <h2
            className="text-3xl font-extrabold leading-tight text-white sm:text-5xl"
            style={{ color: slide.accent }}
          >
            {slide.title}
          </h2>
          <p className="mt-3 text-base text-white/90 sm:text-xl">{slide.subtitle}</p>
          <span
            className="mt-6 inline-flex rounded-full bg-white px-8 py-3 text-sm font-extrabold
                       text-noon-ink transition hover:brightness-95"
          >
            {slide.cta}
          </span>
        </div>
      </Link>

      <button
        type="button"
        onClick={() => go(index - 1)}
        aria-label="الشريحة السابقة"
        className="absolute start-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center
                   rounded-full bg-black/30 text-white transition hover:bg-black/50"
      >
        <ChevronLeft className="size-5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => go(index + 1)}
        aria-label="الشريحة التالية"
        className="absolute end-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center
                   rounded-full bg-black/30 text-white transition hover:bg-black/50"
      >
        <ChevronRight className="size-5" aria-hidden />
      </button>

      <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => go(i)}
            aria-label={`الشريحة ${i + 1}`}
            aria-current={i === index}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/50'
            }`}
          />
        ))}
      </div>
    </section>
  );
}
