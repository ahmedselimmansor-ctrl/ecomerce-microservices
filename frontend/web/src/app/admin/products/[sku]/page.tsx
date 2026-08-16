'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { adminApi, type AdminProduct } from '@/lib/admin-api';
import { ProductForm } from '@/components/admin/ProductForm';
import { ApiError } from '@/lib/api';

export default function EditProductPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = use(params);
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await adminApi.getProduct(decodeURIComponent(sku));
        if (!cancelled) setProduct(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.userMessage : 'تعذّر تحميل المنتج');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sku]);

  if (error) {
    return (
      <div className="rounded-lg border border-noon-line bg-white p-10 text-center">
        <AlertTriangle className="mx-auto size-10 text-noon-red" aria-hidden />
        <p className="mt-3 font-bold">{error}</p>
        <Link
          href="/admin/products"
          className="mt-4 inline-flex rounded-lg bg-noon-yellow px-6 py-2.5 text-sm font-bold"
        >
          العودة للقائمة
        </Link>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="grid h-64 place-items-center">
        <Loader2 className="size-8 animate-spin text-noon-muted" aria-hidden />
      </div>
    );
  }

  return <ProductForm mode="edit" initial={product} />;
}
