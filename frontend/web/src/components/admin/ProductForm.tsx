'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, ArrowRight } from 'lucide-react';
import { z } from 'zod';
import { adminApi, type AdminProduct } from '@/lib/admin-api';
import { ApiError } from '@/lib/api';
import { PLACEHOLDER_IMAGE } from '@/lib/format';
import { NAV } from '@/lib/navigation';

/**
 * التحقق يطابق قيود catalog-service حرفيًا.
 *
 * <p>الهدف تجربة أفضل لا أمان: الخادم يتحقق مجددًا دائمًا. تكرار القاعدة هنا
 * يوفّر على المشرف رحلة شبكة ليكتشف أن الـ slug يحتوي حرفًا كبيرًا.
 */
const formSchema = z.object({
  sku: z.string().regex(/^[A-Za-z0-9._-]{3,64}$/, 'SKU: حروف وأرقام و . _ - فقط (3–64)'),
  slug: z.string().regex(/^[a-z0-9-]{3,160}$/, 'Slug: حروف صغيرة وأرقام وشرطات فقط'),
  titleAr: z.string().min(2, 'الاسم العربي مطلوب').max(255),
  titleEn: z.string().min(2, 'الاسم الإنجليزي مطلوب').max(255),
  descriptionAr: z.string().max(4000).optional().or(z.literal('')),
  descriptionEn: z.string().max(4000).optional().or(z.literal('')),
  brandId: z.string().max(64).optional().or(z.literal('')),
  brandName: z.string().max(120).optional().or(z.literal('')),
  category: z.string().min(1, 'اختر القسم'),
  subCategory: z.string().optional().or(z.literal('')),
  currency: z.string().regex(/^[A-Z]{3}$/, 'رمز عملة من ٣ أحرف'),
  price: z.coerce.number().positive('السعر يجب أن يكون أكبر من صفر'),
  was: z.coerce.number().nonnegative().optional(),
  sellerId: z.string().max(64).optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']),
  stock: z.coerce.number().int().min(0, 'الكمية لا يمكن أن تكون سالبة'),
});

interface Props {
  initial?: AdminProduct;
  mode: 'create' | 'edit';
}

export function ProductForm({ initial, mode }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [imageInput, setImageInput] = useState('');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [attributes, setAttributes] = useState<[string, string][]>(
    Object.entries(initial?.attributes ?? {}).map(([k, v]) => [k, String(v)]),
  );
  const [category, setCategory] = useState(initial?.categoryPath[0] ?? '');

  const subCategories = NAV.find((c) => c.slug === category)?.columns.flatMap((col) =>
    col.links.map((l) => l.slug),
  );
  const uniqueSubs = [...new Set(subCategories ?? [])];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const form = new FormData(event.currentTarget);
    const parsed = formSchema.safeParse(Object.fromEntries(form));

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string') fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      toast.error('راجع الحقول المميّزة بالأحمر');
      return;
    }

    const data = parsed.data;
    setSubmitting(true);

    try {
      // المبالغ بالوحدة الصغرى: المشرف يُدخل بالجنيه ونحوّل هنا مرة واحدة
      await adminApi.saveProduct({
        sku: data.sku,
        slug: data.slug,
        title: { ar: data.titleAr, en: data.titleEn },
        description: { ar: data.descriptionAr || '', en: data.descriptionEn || '' },
        brandId: data.brandId || undefined,
        brandName: data.brandName || undefined,
        categoryPath: [data.category, data.subCategory].filter(Boolean),
        currency: data.currency,
        priceMinor: Math.round(data.price * 100),
        wasMinor: data.was && data.was > 0 ? Math.round(data.was * 100) : undefined,
        images,
        attributes: Object.fromEntries(attributes.filter(([k]) => k.trim())),
        tags,
        sellerId: data.sellerId || undefined,
        status: data.status,
      });

      /*
       * المخزون في خدمة أخرى، ولا نستطيع ضمّه لنفس المعاملة.
       * فشله لا يُبطل حفظ المنتج — ننبّه المشرف ليصحّحه من شاشة المخزون،
       * لأن منتج بلا صف مخزون يُرفض عند أول طلب بـ SKU_NOT_FOUND.
       */
      try {
        await adminApi.saveStock(data.sku, data.stock);
      } catch (stockErr) {
        toast.warning('حُفظ المنتج، لكن تعذّر ضبط المخزون', {
          description: stockErr instanceof ApiError ? stockErr.userMessage : undefined,
        });
      }

      toast.success(mode === 'create' ? 'تم إنشاء المنتج' : 'تم حفظ التعديلات');
      router.push('/admin/products');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.userMessage : 'تعذّر الحفظ');
    } finally {
      setSubmitting(false);
    }
  }

  function addImage() {
    const url = imageInput.trim();
    if (!url) return;
    if (!/^https?:\/\//.test(url)) {
      toast.error('الرابط يجب أن يبدأ بـ http أو https');
      return;
    }
    setImages((prev) => [...prev, url]);
    setImageInput('');
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/products"
            aria-label="رجوع"
            className="grid size-9 place-items-center rounded-lg border border-noon-line bg-white"
          >
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
          </Link>
          <h1 className="text-xl font-extrabold sm:text-2xl">
            {mode === 'create' ? 'منتج جديد' : `تعديل ${initial?.sku}`}
          </h1>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-2 rounded-lg bg-noon-yellow px-6 py-2.5 text-sm
                     font-extrabold text-noon-ink transition hover:brightness-95
                     disabled:opacity-60"
        >
          {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
          حفظ
        </button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Section title="المعلومات الأساسية">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                name="sku"
                label="SKU"
                defaultValue={initial?.sku}
                error={errors.sku}
                required
                // الـ sku مفتاح الربط مع المخزون والطلبات — تغييره يكسرها
                readOnly={mode === 'edit'}
                hint={mode === 'edit' ? 'لا يمكن تغيير الـ SKU بعد الإنشاء' : undefined}
              />
              <Field
                name="slug"
                label="Slug (رابط الصفحة)"
                defaultValue={initial?.slug ?? ''}
                error={errors.slug}
                required
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field name="titleAr" label="الاسم بالعربية" defaultValue={initial?.title.ar}
                     error={errors.titleAr} required />
              <Field name="titleEn" label="الاسم بالإنجليزية" defaultValue={initial?.title.en}
                     error={errors.titleEn} required />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field name="descriptionAr" label="الوصف بالعربية" textarea
                     defaultValue={initial?.description.ar} error={errors.descriptionAr} />
              <Field name="descriptionEn" label="الوصف بالإنجليزية" textarea
                     defaultValue={initial?.description.en} error={errors.descriptionEn} />
            </div>
          </Section>

          <Section title="الصور">
            <div className="flex gap-2">
              <input
                type="url"
                value={imageInput}
                onChange={(e) => setImageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addImage();
                  }
                }}
                placeholder="https://…"
                className="flex-1 rounded-lg border border-noon-line px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={addImage}
                className="flex items-center gap-1.5 rounded-lg border border-noon-line
                           bg-white px-4 py-2 text-sm font-semibold"
              >
                <Plus className="size-4" aria-hidden /> إضافة
              </button>
            </div>

            {images.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {images.map((src, index) => (
                  <li key={`${src}-${index}`} className="relative">
                    <span className="relative block size-20 overflow-hidden rounded-lg
                                     border border-noon-line bg-white">
                      <Image src={src} alt="" fill sizes="80px" className="object-contain p-1" />
                    </span>
                    <button
                      type="button"
                      onClick={() => setImages((prev) => prev.filter((_, i) => i !== index))}
                      aria-label="حذف الصورة"
                      className="absolute -end-1.5 -top-1.5 grid size-6 place-items-center
                                 rounded-full bg-noon-red text-white"
                    >
                      <Trash2 className="size-3" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-2 text-xs text-noon-muted">
              في الإنتاج تُرفع الصور إلى S3 وتُقدَّم عبر CloudFront. هنا نقبل روابط مباشرة.
            </p>
          </Section>

          <Section title="المواصفات">
            {attributes.map(([key, value], index) => (
              <div key={index} className="flex gap-2">
                <input
                  value={key}
                  onChange={(e) =>
                    setAttributes((prev) =>
                      prev.map((pair, i) => (i === index ? [e.target.value, pair[1]] : pair)))
                  }
                  placeholder="اسم الخاصية (color)"
                  className="flex-1 rounded-lg border border-noon-line px-3 py-2 text-sm"
                />
                <input
                  value={value}
                  onChange={(e) =>
                    setAttributes((prev) =>
                      prev.map((pair, i) => (i === index ? [pair[0], e.target.value] : pair)))
                  }
                  placeholder="القيمة (Black)"
                  className="flex-1 rounded-lg border border-noon-line px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setAttributes((prev) => prev.filter((_, i) => i !== index))}
                  aria-label="حذف الخاصية"
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-noon-red
                             hover:bg-noon-red/10"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setAttributes((prev) => [...prev, ['', '']])}
              className="flex items-center gap-1.5 rounded-lg border border-dashed
                         border-noon-line px-3 py-2 text-sm font-semibold text-noon-blue"
            >
              <Plus className="size-4" aria-hidden /> إضافة خاصية
            </button>
          </Section>
        </div>

        {/* ------------------------------------------------------------ side */}
        <div className="space-y-4">
          <Section title="السعر والمخزون">
            <div className="grid grid-cols-2 gap-3">
              <Field
                name="price"
                label="السعر"
                type="number"
                step="0.01"
                defaultValue={initial ? String(initial.priceMinor / 100) : ''}
                error={errors.price}
                required
              />
              <Field
                name="was"
                label="السعر قبل الخصم"
                type="number"
                step="0.01"
                defaultValue={initial?.wasMinor ? String(initial.wasMinor / 100) : ''}
                error={errors.was}
              />
            </div>

            <Field name="currency" label="العملة" defaultValue={initial?.currency ?? 'EGP'}
                   error={errors.currency} required />

            <Field
              name="stock"
              label="الكمية المتاحة"
              type="number"
              defaultValue="0"
              error={errors.stock}
              hint="تُحفظ في inventory-service. المحجوز لطلبات جارية لا يتأثر."
              required
            />
          </Section>

          <Section title="التصنيف">
            <div>
              <label htmlFor="category" className="mb-1 block text-xs font-semibold text-noon-muted">
                القسم <span className="text-noon-red">*</span>
              </label>
              <select
                id="category"
                name="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-sm
                  ${errors.category ? 'border-noon-red' : 'border-noon-line'}`}
              >
                <option value="">— اختر —</option>
                {NAV.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.label}</option>
                ))}
              </select>
              {errors.category && (
                <p className="mt-1 text-xs text-noon-red">{errors.category}</p>
              )}
            </div>

            <div>
              <label htmlFor="subCategory" className="mb-1 block text-xs font-semibold text-noon-muted">
                القسم الفرعي
              </label>
              <select
                id="subCategory"
                name="subCategory"
                defaultValue={initial?.categoryPath[1] ?? ''}
                className="w-full rounded-lg border border-noon-line px-3 py-2 text-sm"
              >
                <option value="">— بدون —</option>
                {uniqueSubs.map((slug) => (
                  <option key={slug} value={slug}>{slug}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field name="brandId" label="معرّف العلامة" defaultValue={initial?.brandId ?? ''} />
              <Field name="brandName" label="اسم العلامة" defaultValue={initial?.brandName ?? ''} />
            </div>

            <Field name="sellerId" label="البائع" defaultValue={initial?.sellerId ?? 'noon-retail'} />
          </Section>

          <Section title="الوسوم والحالة">
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const tag = tagInput.trim().toLowerCase();
                    if (tag && !tags.includes(tag)) setTags((prev) => [...prev, tag]);
                    setTagInput('');
                  }
                }}
                placeholder="express, bestseller…"
                className="flex-1 rounded-lg border border-noon-line px-3 py-2 text-sm"
              />
            </div>
            {tags.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <li key={tag}>
                    <button
                      type="button"
                      onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                      className="rounded-full bg-noon-bg px-3 py-1 text-xs font-semibold
                                 hover:bg-noon-red/10 hover:text-noon-red"
                    >
                      {tag} ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-noon-muted">
              الوسوم تتحكم في شارات البطاقة: <code>bestseller</code> · <code>express</code> ·{' '}
              <code>low-stock</code> · <code>market</code>
            </p>

            <div>
              <label htmlFor="status" className="mb-1 block text-xs font-semibold text-noon-muted">
                الحالة
              </label>
              <select
                id="status"
                name="status"
                defaultValue={initial?.status ?? 'ACTIVE'}
                className="w-full rounded-lg border border-noon-line px-3 py-2 text-sm"
              >
                <option value="ACTIVE">نشط — يظهر في المتجر</option>
                <option value="INACTIVE">غير نشط — مخفي</option>
                <option value="ARCHIVED">مؤرشف</option>
              </select>
            </div>
          </Section>

          <div className="rounded-lg border border-noon-line bg-white p-3">
            <p className="mb-2 text-xs font-semibold text-noon-muted">معاينة البطاقة</p>
            <div className="relative aspect-square overflow-hidden rounded bg-noon-bg">
              <Image
                src={images[0] || PLACEHOLDER_IMAGE}
                alt=""
                fill
                sizes="200px"
                className="object-contain p-3"
                unoptimized={!images[0]}
              />
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-noon-line bg-white p-4">
      <h2 className="text-base font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

interface FieldProps {
  name: string;
  label: string;
  type?: string;
  step?: string;
  defaultValue?: string;
  error?: string;
  required?: boolean;
  readOnly?: boolean;
  hint?: string;
  textarea?: boolean;
}

function Field({
  name, label, type = 'text', step, defaultValue, error, required, readOnly, hint, textarea,
}: FieldProps) {
  const className = `w-full rounded-lg border px-3 py-2 text-sm
    ${error ? 'border-noon-red' : 'border-noon-line'}
    ${readOnly ? 'bg-noon-bg text-noon-muted' : ''}`;

  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-xs font-semibold text-noon-muted">
        {label}
        {required && <span className="text-noon-red"> *</span>}
      </label>

      {textarea ? (
        <textarea
          id={name}
          name={name}
          rows={3}
          defaultValue={defaultValue}
          aria-invalid={Boolean(error)}
          className={className}
        />
      ) : (
        <input
          id={name}
          name={name}
          type={type}
          step={step}
          defaultValue={defaultValue}
          readOnly={readOnly}
          aria-invalid={Boolean(error)}
          className={className}
        />
      )}

      {error && <p className="mt-1 text-xs text-noon-red">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-noon-muted">{hint}</p>}
    </div>
  );
}
