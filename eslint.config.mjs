import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    '.next-test/**',
    '.next-build/**',
    '.npm-cache/**',
    'data/**',
    'artifacts/**',
    'test-results/**',
    'playwright-report/**',
    'src/data/**',
    'next-env.d.ts',
    'public/flags/**',
  ]),
]);
