import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { invalidateWorldCache } from '@/lib/world-cache';
import { stripeEnvironment } from '@/lib/payments-config';
import {
  creditSponsorTopup,
  refundSponsorTopup,
  freezeSponsorAccount,
  closeSponsorDispute,
} from '@/lib/sponsoring';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET)
    return NextResponse.json({ error: 'Stripe non configuré.' }, { status: 503 });
  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Signature requise.' }, { status: 400 });
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      await request.text(),
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return NextResponse.json({ error: 'Signature invalide.' }, { status: 400 });
  }
  if (!stripeEnvironment() || event.livemode !== (stripeEnvironment() === 'live'))
    return NextResponse.json({ error: 'Environnement Stripe incohérent.' }, { status: 400 });
  try {
    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      const session = event.data.object;
      if (session.payment_status !== 'paid') return NextResponse.json({ received: true });
      if (session.metadata?.kind !== 'sponsor_topup') return NextResponse.json({ received: true });
      const intent =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id || '';
      await creditSponsorTopup({
        topupId: session.metadata.topup_id,
        userId: session.metadata.user_id,
        checkoutId: session.id,
        paymentIntent: intent,
        amount: session.amount_total || 0,
        currency: session.currency || '',
        eventId: event.id,
      });
    } else if (event.type === 'charge.refunded') {
      const charge = event.data.object;
      const intent =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id || '';
      if (charge.currency === 'eur' && intent)
        await refundSponsorTopup(
          intent,
          charge.metadata?.topup_id,
          charge.amount_refunded,
          charge.amount,
          event.id,
        );
    } else if (event.type === 'charge.dispute.created') {
      const dispute = event.data.object;
      const intent =
        typeof dispute.payment_intent === 'string'
          ? dispute.payment_intent
          : dispute.payment_intent?.id || '';
      if (intent) await freezeSponsorAccount(intent, event.id);
    } else if (event.type === 'charge.dispute.closed') {
      const dispute = event.data.object;
      const intent =
        typeof dispute.payment_intent === 'string'
          ? dispute.payment_intent
          : dispute.payment_intent?.id || '';
      if (intent) await closeSponsorDispute(intent, dispute.status === 'won', event.id);
    }
    invalidateWorldCache();
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Stripe fulfilment failed', error);
    return NextResponse.json({ error: 'Confirmation impossible.' }, { status: 500 });
  }
}
