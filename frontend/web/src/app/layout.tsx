import type { Metadata, Viewport } from 'next';
import { Cairo, Bricolage_Grotesque } from 'next/font/google';
import { Toaster } from 'sonner';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Providers } from './providers';
import './globals.css';

const appFont = Cairo({
  subsets: ['arabic', 'latin'],
  variable: '--font-app',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
});

/*
 * وجه العرض للّاتيني فقط: الشعار وعناوين الأقسام اللاتينية. لا يحمل عربيًا،
 * وهذا مقصود — العربي يبقى على Cairo، فينقسم النظام بالدور لا بالمزاج.
 */
const displayFont = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['500', '600', '800'],
});

export const metadata: Metadata = {
  title: {
    default: 'TopChoice — تسوّق أونلاين في مصر',
    template: '%s | TopChoice',
  },
  description:
    'تسوّق إلكترونيات، أزياء، جمال ومستلزمات المنزل بأسعار منافسة وتوصيل سريع.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  applicationName: 'TopChoice',
  openGraph: {
    type: 'website',
    locale: 'ar_EG',
    siteName: 'TopChoice',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0c4a54',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${appFont.variable} ${displayFont.variable}`}>
      <head>
        {/* اتصال مبكر بالـ API يوفّر رحلة TLS كاملة عند أول طلب */}
        <link
          rel="preconnect"
          href={process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'}
        />
      </head>
      <body className="min-h-dvh flex flex-col antialiased">
        <Providers>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:right-2
                       focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2
                       focus:shadow-lg"
          >
            تخطَّ إلى المحتوى
          </a>
          <Header />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
          <Toaster
            position="top-center"
            dir="rtl"
            richColors
            closeButton
            toastOptions={{ style: { fontFamily: 'var(--font-app)' } }}
          />
        </Providers>
      </body>
    </html>
  );
}
