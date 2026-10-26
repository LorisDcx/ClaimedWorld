import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSameOrigin, readJsonBody } from '../src/lib/auth';
import { paymentStatus, stripeEnvironment } from '../src/lib/payments-config';
import { cachedAnonymousWorld, invalidateWorldCache } from '../src/lib/world-cache';
import type { Snapshot } from '../src/lib/types';

test('origin checks reject cross-site posts even without Origin and never trust a forged Host', () => {
  const originalMode = process.env.NODE_ENV,
    originalUrl = process.env.NEXT_PUBLIC_APP_URL;
  Object.assign(process.env, {
    NODE_ENV: 'production',
    NEXT_PUBLIC_APP_URL: 'https://claimed-world.vercel.app',
  });
  try {
    assert.throws(
      () =>
        assertSameOrigin(
          new Request('https://claimed-world.vercel.app/api/game', {
            headers: { 'sec-fetch-site': 'cross-site' },
          }),
        ),
      /Origine/,
    );
    assert.throws(
      () =>
        assertSameOrigin(
          new Request('https://claimed-world.vercel.app/api/game', {
            headers: { origin: 'https://evil.example', host: 'evil.example' },
          }),
        ),
      /Origine/,
    );
    assert.doesNotThrow(() =>
      assertSameOrigin(
        new Request('https://claimed-world.vercel.app/api/game', {
          headers: { origin: 'https://claimed-world.vercel.app', 'sec-fetch-site': 'same-origin' },
        }),
      ),
    );
  } finally {
    if (originalMode === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Object.assign(process.env, { NODE_ENV: originalMode });
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalUrl;
  }
});
test('JSON limits count streamed bytes and reject invalid object payloads', async () => {
  const make = (body: string) =>
    new Request('http://localhost/api/game', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
  await assert.rejects(
    () => readJsonBody(make(JSON.stringify({ text: 'é'.repeat(100) })), 150),
    /volumineuse/,
  );
  await assert.rejects(() => readJsonBody(make('null')), /objet JSON/);
  await assert.rejects(() => readJsonBody(make('[]')), /objet JSON/);
  assert.deepEqual(await readJsonBody(make('{"action":"login"}')), { action: 'login' });
});
test('switching to a live or restricted Stripe key cannot enable checkout without explicit launch approval', () => {
  const keys = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'ENABLE_PAYMENTS',
    'LIVE_PAYMENT_LAUNCH_APPROVED',
  ] as const;
  const previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    Object.assign(process.env, {
      ENABLE_PAYMENTS: 'true',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_only',
      STRIPE_SECRET_KEY: 'sk_live_unit_only',
      LIVE_PAYMENT_LAUNCH_APPROVED: 'false',
    });
    assert.equal(paymentStatus().enabled, false);
    assert.equal(paymentStatus().mode, 'disabled');
    process.env.STRIPE_SECRET_KEY = 'rk_live_unit_only';
    assert.equal(stripeEnvironment(), 'live');
    assert.equal(paymentStatus().enabled, false);
    process.env.STRIPE_SECRET_KEY = 'sk_test_unit_only';
    assert.equal(paymentStatus().mode, 'test');
  } finally {
    for (const k of keys)
      if (previous[k] === undefined) delete process.env[k];
      else process.env[k] = previous[k];
  }
});
test('anonymous snapshot caching coalesces concurrent reads, expires and invalidates without retaining rejected loads', async () => {
  invalidateWorldCache();
  let calls = 0;
  const load = async () => {
    calls++;
    return { serverTime: calls, player: null } as Snapshot;
  };
  const [a, b] = await Promise.all([cachedAnonymousWorld(load, 0), cachedAnonymousWorld(load, 0)]);
  assert.equal(a, b);
  assert.equal(calls, 1);
  await cachedAnonymousWorld(load, 1001);
  assert.equal(calls, 2);
  invalidateWorldCache();
  await cachedAnonymousWorld(load, 1002);
  assert.equal(calls, 3);
  invalidateWorldCache();
  await assert.rejects(() =>
    cachedAnonymousWorld(async () => {
      throw new Error('offline');
    }, 1003),
  );
  await cachedAnonymousWorld(load, 1004);
  assert.equal(calls, 4);
  invalidateWorldCache();
});
