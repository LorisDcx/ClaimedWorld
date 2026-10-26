import { defineConfig } from '@playwright/test';
const testDatabasePath = process.env.E2E_DATABASE_PATH || `./data/test-${Date.now()}.sqlite`;
process.env.E2E_DATABASE_PATH = testDatabasePath;
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:3001',
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 3001',
    url: 'http://127.0.0.1:3001/api/game',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NEXT_DIST_DIR: '.next-test',
      DATABASE_PATH: testDatabasePath,
      DATABASE_URL: '',
      POSTGRES_URL: '',
      VERCEL: '',
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
      SUPABASE_SECRET_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      ADMIN_USERNAME: 'AdminTest',
      ADMIN_PASSWORD: 'Admin-password-123!',
      ENABLE_PAYMENTS: 'false',
      STRIPE_SECRET_KEY: 'sk_test_local_webhook_only',
      STRIPE_WEBHOOK_SECRET: 'whsec_e2e_local_webhook_only',
    },
  },
});
