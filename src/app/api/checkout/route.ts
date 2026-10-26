import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { assertSameOrigin, GameError, rateLimit, sessionUser } from '@/lib/auth';
import { get, run, transaction } from '@/lib/db';
import { sponsorWallet } from '@/lib/sponsoring';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    if (
      process.env.ENABLE_PAYMENTS !== 'true' ||
      !process.env.STRIPE_SECRET_KEY ||
      !process.env.STRIPE_WEBHOOK_SECRET
    )
      throw new GameError('Les paiements ne sont pas activés sur cette installation.', 503);
    assertSameOrigin(request);
    const uid = await sessionUser();
    if (!uid) throw new GameError('Connectez-vous pour continuer.', 401);
    rateLimit(`checkout:${uid}`, 10, 60000);
    const body = z
      .object({
        amountCents: z.number().int().min(500).max(1000000),
        requestId: z.string().uuid(),
        termsAccepted: z.literal(true),
      })
      .parse(await request.json());
    if (!get("SELECT id FROM sponsors WHERE user_id=? AND status='approved'", uid))
      throw new GameError('Faites approuver un visuel avant de recharger votre portefeuille.');
    if (sponsorWallet(uid).frozen)
      throw new GameError('Ce compte de sponsoring nécessite une vérification.', 403);
    const now = Date.now();
    const topup = transaction(() => {
      run(
        'INSERT OR IGNORE INTO sponsor_topups(id,user_id,request_id,amount_cents,created_at) VALUES(?,?,?,?,?)',
        randomUUID(),
        uid,
        body.requestId,
        body.amountCents,
        now,
      );
      return get<{
        id: string;
        amount_cents: number;
        checkout_id: string | null;
        checkout_expires: number | null;
        credited_at: number | null;
      }>('SELECT * FROM sponsor_topups WHERE user_id=? AND request_id=?', uid, body.requestId)!;
    });
    if (topup.amount_cents !== body.amountCents)
      throw new GameError('Cette demande correspond à un autre montant.', 409);
    if (topup.credited_at !== null) throw new GameError('Cette recharge a déjà été créditée.', 409);
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    if (topup.checkout_id) {
      const existing = await stripe.checkout.sessions.retrieve(topup.checkout_id);
      if (existing.status === 'open' && existing.url)
        return NextResponse.json({ url: existing.url });
      throw new GameError(
        'Cette session est terminée. Vérifiez votre solde ou créez une nouvelle demande.',
        409,
      );
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const expires = Math.floor(now / 1000) + 31 * 60;
    const metadata = { kind: 'sponsor_topup', topup_id: topup.id, user_id: uid };
    const checkout = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        allowed_payment_method_types: ['card'],
        expires_at: expires,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'eur',
              unit_amount: body.amountCents,
              product_data: {
                name: 'Crédits sponsor CLAIMED.WORLD',
                description:
                  '1 crédit = 1 €. Le portefeuille est conservé. Les crédits engagés sont déplaçables entre pays, ne reviennent jamais au portefeuille et expirent 30 jours après leur premier placement. Un déplacement ne prolonge pas ce délai.',
              },
            },
          },
        ],
        metadata,
        payment_intent_data: { metadata },
        custom_text: {
          submit: {
            message:
              'Crédits publicitaires uniquement : aucun avantage de conquête. Minimum 5 crédits engagés par pays. Le solde non engagé est conservé, sans remise à zéro de saison.',
          },
        },
        success_url: `${appUrl}/?payment=success`,
        cancel_url: `${appUrl}/?payment=cancel`,
      },
      { idempotencyKey: `sponsor-topup-${topup.id}` },
    );
    run(
      'UPDATE sponsor_topups SET checkout_id=?,checkout_expires=? WHERE id=? AND credited_at IS NULL',
      checkout.id,
      expires * 1000,
      topup.id,
    );
    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    if (error instanceof GameError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: 'Recharge invalide : minimum 5 €, avec acceptation des conditions.' },
        { status: 400 },
      );
    console.error('Checkout failed', error);
    return NextResponse.json({ error: 'Impossible d’ouvrir Stripe. Réessayez.' }, { status: 502 });
  }
}
