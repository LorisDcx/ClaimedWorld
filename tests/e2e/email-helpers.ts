import type { APIRequestContext, Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
export function testEmail(name: string) {
  return `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com`;
}
export async function emailCode(email: string) {
  const name = createHash('sha256').update(email).digest('hex');
  return JSON.parse(await readFile(path.resolve('data/e2e-email-outbox', `${name}.json`), 'utf8'))
    .code as string;
}
export async function gamePost(context: APIRequestContext, data: Record<string, unknown>) {
  const email = testEmail(String(data.username));
  const result = await context.post('/api/game', {
    data: data.action === 'signup' ? { ...data, email } : data,
  });
  if (data.action === 'signup' && result.status() === 202)
    return context.post('/api/account/email', {
      data: { action: 'verify', code: await emailCode(email) },
    });
  if (data.action === 'login' && result.ok()) {
    const snapshot = await result.json();
    if (!snapshot.account?.emailVerified) {
      const send = await context.post('/api/account/email', {
        data: { action: 'send', email, password: data.password },
      });
      if (!send.ok()) throw new Error(`Legacy email request failed: ${send.status()}`);
      return context.post('/api/account/email', {
        data: { action: 'verify', code: await emailCode(email) },
      });
    }
  }
  return result;
}
export async function confirmEmailUI(page: Page, email: string) {
  await page.getByLabel('Code de vérification').fill(await emailCode(email));
  await page.getByRole('button', { name: 'Vérifier mon adresse', exact: true }).click();
}
