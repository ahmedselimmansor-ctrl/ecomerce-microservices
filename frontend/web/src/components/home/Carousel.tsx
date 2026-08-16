'use client';

import { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** عرض البطاقة الواحدة — يُستخدم لحساب مقدار التمرير. */
  itemClassName?: string;
  className?: string;
}

/**
 * كاروسيل أفقي بأسهم.
 *
 * <p>يعتمد على تمرير CSS الأصلي لا على تحويلات JS: يبقى قابلًا للسحب باللمس
 * على الموبايل، ويعمل بلوحة المفاتيح، ويحافظ على أداء التمرير.
 * الأسهم تختفي عند بلوغ الطرف بدل أن تبقى معطّلة بلا معنى.
 */
export function Carousel({ children, className = '' }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const updateEdges = () => {
    const el = trackRef.current;
    if (!el) return;
    // القيم سالبة في اتجاه RTL — نستخدم القيمة المطلقة
    const scroll = Math.abs(el.scrollLeft);
    setAtStart(scroll < 8);
    setAtEnd(scroll + el.clientWidth >= el.scrollWidth - 8);
  };

  useEffect(() => {
    updateEdges();
    const el = trackRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scrollBy = (direction: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const isRtl = getComputedStyle(el).direction === 'rtl';
    el.scrollBy({ left: direction * el.clientWidth * 0.85 * (isRtl ? -1 : 1), behavior: 'smooth' });
  };

  return (
    <div className={`group relative ${className}`}>
      <div
        ref={trackRef}
        onScroll={updateEdges}
        className="scrollbar-none flex gap-3 overflow-x-auto scroll-smooth"
      >
        {children}
      </div>

      {!atStart && (
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label="السابق"
          className="absolute start-0 top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center
                     rounded-full border border-noon-line bg-white text-noon-ink shadow-md
                     transition hover:bg-noon-bg"
        >
          <ChevronLeft className="size-5 rtl:rotate-180" aria-hidden />
        </button>
      )}
      {!atEnd && (
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label="التالي"
          className="absolute end-0 top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center
                     rounded-full border border-noon-line bg-white text-noon-ink shadow-md
                     transition hover:bg-noon-bg"
        >
          <ChevronRight className="size-5 rtl:rotate-180" aria-hidden />
        </button>
      )}
    </div>
  );
}
