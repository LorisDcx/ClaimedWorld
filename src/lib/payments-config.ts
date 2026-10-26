export function stripeEnvironment(key = process.env.STRIPE_SECRET_KEY): 'test' | 'live' | null {
  const value = key?.match(/^(?:sk|rk)_(test|live)_/);
  return value ? (value[1] as 'test' | 'live') : null;
}
export function paymentStatus() {
  const environment = stripeEnvironment();
  const enabled =
    process.env.ENABLE_PAYMENTS === 'true' &&
    !!environment &&
    !!process.env.STRIPE_WEBHOOK_SECRET &&
    (environment !== 'live' || process.env.LIVE_PAYMENT_LAUNCH_APPROVED === 'true');
  return { enabled, mode: enabled ? environment! : ('disabled' as const) };
}
