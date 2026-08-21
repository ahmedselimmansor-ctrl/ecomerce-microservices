import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

/**
 * إعداد ESLint المسطّح (flat config).
 *
 * نمرّ عبر FlatCompat لأن eslint-config-next ما زال يُصدَّر بالصيغة القديمة،
 * وترجمته يدويًا تعني إعادة كتابة قواعد يصونها فريق Next نيابةً عنّا.
 */
const config = [
  {
    // dist-test ناتج tsc للاختبارات — كود مولَّد لا مصدر، وفحصه يُنتج
    // أخطاء عن أسلوب استيراد لم نكتبه نحن.
    ignores: [
      '.next/**',
      'node_modules/**',
      'dist-test/**',
      'next-env.d.ts',
      'tsconfig.tsbuildinfo',
    ],
  },

  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  {
    rules: {
      /*
       * الحرف المكشوف في JSX يكسر الترميز أحيانًا، لكن الواجهة عربية بالكامل
       * ونصوصها مليئة بعلامات التنصيص العربية. القاعدة هنا ضجيج خالص.
       */
      'react/no-unescaped-entities': 'off',

      // متغيّر غير مستعمل خطأ حقيقي، إلا ما بُدئ بـ _ فهو إهمال مقصود
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],

      /*
       * `any` يُبطل الغرض من TypeScript في مشروع كل حدوده مُتحقَّق منها بـ Zod.
       * تحذير لا خطأ: لا نريد كسر البناء على سطر واحد أثناء التطوير.
       */
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];

export default config;
