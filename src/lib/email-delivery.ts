import nodemailer from 'nodemailer';
import { verificationEmail } from './email-template';
import type { Locale } from '@/i18n/locales';

export function testEmailOutbox() {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.VERCEL !== '1' &&
    !process.env.DATABASE_URL &&
    !process.env.POSTGRES_URL &&
    process.env.EMAIL_TEST_OUTBOX
  );
}

export function emailDeliveryConfigured() {
  return !!(
    testEmailOutbox() ||
    (process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASSWORD &&
      process.env.SMTP_FROM)
  );
}

export function smtpTransport() {
  const port = Number(process.env.SMTP_PORT || 465);
  if (![465, 587].includes(port)) throw new Error('SMTP must use TLS.');
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: true,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASSWORD!.replaceAll(' ', '') },
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}

export async function sendVerificationEmail(email: string, code: string, locale: Locale = 'fr') {
  const message = verificationEmail(code, locale);
  if (!emailDeliveryConfigured()) throw new Error('Email delivery unavailable');
  const outbox = testEmailOutbox();
  if (outbox) {
    // Isolated local browser tests only. Never log or return verification codes.
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { createHash } = await import('node:crypto');
    const path = await import('node:path');
    await mkdir(outbox, { recursive: true });
    await writeFile(
      path.join(outbox, `${createHash('sha256').update(email).digest('hex')}.json`),
      JSON.stringify({ email, code }),
    );
    return;
  }
  const transporter = smtpTransport();
  try {
    await transporter.sendMail({
      from: { name: 'CLAIMED.WORLD', address: process.env.SMTP_FROM! },
      to: email,
      ...message,
    });
  } finally {
    transporter.close();
  }
}
