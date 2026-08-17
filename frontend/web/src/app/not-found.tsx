import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <p className="text-6xl font-extrabold text-tc-line tabular">404</p>
      <h1 className="mt-4 text-xl font-extrabold">الصفحة غير موجودة</h1>
      <p className="mt-2 text-sm text-tc-muted">
        الرابط الذي فتحته قد يكون منتهيًا أو مكتوبًا بشكل خاطئ.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex rounded-lg bg-tc-accent px-6 py-2.5 text-sm font-bold"
      >
        العودة للرئيسية
      </Link>
    </div>
  );
}
