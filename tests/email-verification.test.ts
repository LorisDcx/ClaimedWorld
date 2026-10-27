import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { emailIdentity, registrationPassword } from '../src/lib/email-policy';
import {
  beginEmailVerification,
  confirmEmailVerification,
  pendingEmailVerification,
  resendEmailVerification,
} from '../src/lib/email-verification';
import { requireVerifiedEmail, hashPassword } from '../src/lib/auth';
import { get, run } from '../src/lib/storage';
import { emailDeliveryConfigured, testEmailOutbox } from '../src/lib/email-delivery';
import { snapshot } from '../src/lib/db';
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_PATH: ':memory:',
  DATABASE_URL: '',
  POSTGRES_URL: '',
  VERCEL: '',
  EMAIL_TEST_OUTBOX: path.resolve('data/email-unit-outbox'),
});
beforeEach(async () => {
  await run('DELETE FROM rate_limits');
});
async function sentCode(email: string) {
  const name = createHash('sha256').update(email).digest('hex');
  return JSON.parse(
    await readFile(path.join(process.env.EMAIL_TEST_OUTBOX!, `${name}.json`), 'utf8'),
  ).code as string;
}
function registration(email = `${randomUUID()}@example.com`) {
  return {
    email,
    username: `P${randomUUID().slice(0, 14)}`,
    password: 'Carte-42',
    color: '#111111',
    ip: randomUUID(),
  };
}

test('disposable providers and their subdomains are rejected; normal and private domains stay valid', () => {
  for (const email of [
    'a@yopmail.com',
    'a@YOPMAIL.FR',
    'a@mail.yopmail.net',
    'a@mailinator.com',
    'a@guerrillamail.com',
    'a@10minutemail.com',
    'a@tempmail.com',
  ])
    assert.throws(() => emailIdentity(email), /temporaires/);
  for (const email of ['a@gmail.com', 'a@outlook.fr', 'a@proton.me', 'a@monentreprise.fr'])
    assert.doesNotThrow(() => emailIdentity(email));
  for (const email of ['', 'a', 'a@', 'a@example.com\nBcc:victim@example.com'])
    assert.throws(() => emailIdentity(email));
});
test('canonical identities stop Gmail dot/plus/googlemail variants and known provider plus aliases', () => {
  assert.deepEqual(emailIdentity(' F.oo+jeu@GoogleMail.com '), {
    email: 'f.oo+jeu@googlemail.com',
    key: 'foo@gmail.com',
  });
  assert.equal(emailIdentity('foo@gmail.com').key, emailIdentity('f.o.o+another@gmail.com').key);
  assert.equal(emailIdentity('foo+game@outlook.com').key, 'foo@outlook.com');
  assert.equal(emailIdentity('a.b+tag@custom.fr').key, 'a.b+tag@custom.fr');
});
test('eight-character passwords work, while short, obvious and username passwords are rejected', () => {
  assert.equal(registrationPassword('Carte-42', 'Joueur'), 'Carte-42');
  for (const password of ['court', '12345678', 'password123', 'MonPseudo'])
    assert.throws(() => registrationPassword(password, 'MonPseudo'));
});
test('creating many pending signups from the same address is throttled before any Influence is granted', async () => {
  const ip = randomUUID();
  for (let i = 0; i < 6; i++) await beginEmailVerification({ ...registration(), ip });
  await assert.rejects(() => beginEmailVerification({ ...registration(), ip }), /tentatives/);
});
test('a pending signup has no account, no Influence and no session; email confirmation activates it once', async () => {
  const input = registration();
  const pending = await beginEmailVerification(input);
  assert.equal(await get('SELECT id FROM users WHERE username=?', input.username), undefined);
  const row = await get(
    'SELECT * FROM email_challenges WHERE token_hash=?',
    createHash('sha256').update(pending.token).digest('hex'),
  );
  const code = await sentCode(input.email);
  assert.notEqual(row?.code_hash, code);
  assert.notEqual(row?.password, input.password);
  assert.equal((await pendingEmailVerification(pending.token, null))?.email, input.email);
  const uid = await confirmEmailVerification(pending.token, code, null);
  assert.equal((await get('SELECT wallet FROM users WHERE id=?', uid))?.wallet, 100);
  await assert.doesNotReject(() => requireVerifiedEmail(uid));
  await assert.rejects(() => confirmEmailVerification(pending.token, code, null), /expiré|utilisé/);
});
test('five wrong codes remain counted and lock that challenge, including the correct code afterward', async () => {
  const input = registration();
  const pending = await beginEmailVerification(input);
  const correct = await sentCode(input.email);
  const wrong = correct === '000000' ? '000001' : '000000';
  for (let i = 0; i < 5; i++)
    await assert.rejects(() => confirmEmailVerification(pending.token, wrong, null), /incorrect/);
  await assert.rejects(() => confirmEmailVerification(pending.token, correct, null), /tentatives/);
  assert.equal(await get('SELECT id FROM users WHERE username=?', input.username), undefined);
});
test('codes expire and cannot be confirmed from another session', async () => {
  const input = registration();
  const now = Date.now();
  const pending = await beginEmailVerification(input, now);
  const code = await sentCode(input.email);
  await assert.rejects(() => confirmEmailVerification(pending.token, code, 'other-user'), /expiré/);
  await assert.rejects(
    () => confirmEmailVerification(pending.token, code, null, now + 600001),
    /expiré/,
  );
  assert.equal(await pendingEmailVerification(pending.token, null, now + 600001), null);
});
test('email uniqueness includes alias identities and stays enforced after a challenge was issued', async () => {
  const base = randomUUID().replaceAll('-', '');
  const first = registration(`${base}@gmail.com`),
    second = registration(`${base}+bis@googlemail.com`);
  const a = await beginEmailVerification(first);
  await run('DELETE FROM rate_limits');
  const b = await beginEmailVerification(second);
  await confirmEmailVerification(a.token, await sentCode(first.email), null);
  const secondCode = await sentCode(second.email);
  await assert.rejects(() => confirmEmailVerification(b.token, secondCode, null), /associée/);
  await run('DELETE FROM rate_limits');
  await assert.rejects(
    () => beginEmailVerification(registration(`${base}+trois@gmail.com`)),
    /associée|utilisée/,
  );
});
test('resend has a cooldown and invalidates the previous code', async () => {
  const input = registration();
  const pending = await beginEmailVerification(input);
  const old = await sentCode(input.email);
  await assert.rejects(() => resendEmailVerification(pending.token, null, input.ip), /tentatives/);
  await run('DELETE FROM rate_limits');
  await resendEmailVerification(pending.token, null, input.ip);
  const current = await sentCode(input.email);
  if (old !== current)
    await assert.rejects(() => confirmEmailVerification(pending.token, old, null), /incorrect/);
  await confirmEmailVerification(pending.token, current, null);
});
test('legacy account verification preserves identity, stock, role and financial wallet', async () => {
  const uid = randomUUID();
  const email = `${uid}@example.com`;
  const now = Date.now();
  await run(
    'INSERT INTO users(id,username,password,color,created_at,generation_anchor,wallet,is_admin) VALUES(?,?,?,?,?,?,?,1)',
    uid,
    uid,
    hashPassword('Carte-42'),
    '#111111',
    now,
    now,
    37,
  );
  await run('INSERT INTO sponsor_wallets(user_id,balance_cents) VALUES(?,?)', uid, 1234);
  await assert.rejects(() => requireVerifiedEmail(uid), /Vérifiez/);
  const pending = await beginEmailVerification({ email, userId: uid, ip: randomUUID() });
  assert.equal(await pendingEmailVerification(pending.token, null), null);
  const code = await sentCode(email);
  await assert.rejects(() => confirmEmailVerification(pending.token, code, null), /expiré/);
  assert.equal(await confirmEmailVerification(pending.token, await sentCode(email), uid), uid);
  assert.equal((await get('SELECT wallet FROM users WHERE id=?', uid))?.wallet, 37);
  assert.equal((await get('SELECT is_admin FROM users WHERE id=?', uid))?.is_admin, 1);
  assert.equal(
    (await get('SELECT balance_cents FROM sponsor_wallets WHERE user_id=?', uid))?.balance_cents,
    1234,
  );
});
test('registration refuses missing delivery configuration and cannot use the test outbox in production', async () => {
  const old = {
    outbox: process.env.EMAIL_TEST_OUTBOX,
    pass: process.env.SMTP_PASSWORD,
    mode: process.env.NODE_ENV,
  };
  try {
    delete process.env.EMAIL_TEST_OUTBOX;
    delete process.env.SMTP_PASSWORD;
    assert.equal(emailDeliveryConfigured(), false);
    await assert.rejects(() => beginEmailVerification(registration()), /indisponible/);
    process.env.EMAIL_TEST_OUTBOX = old.outbox;
    Object.assign(process.env, { NODE_ENV: 'production' });
    assert.equal(testEmailOutbox(), false);
    assert.equal(emailDeliveryConfigured(), false);
  } finally {
    process.env.EMAIL_TEST_OUTBOX = old.outbox;
    if (old.pass) process.env.SMTP_PASSWORD = old.pass;
    Object.assign(process.env, { NODE_ENV: old.mode });
  }
});
test('private email status never appears in anonymous snapshots or public leaderboards', async () => {
  const input = registration();
  const pending = await beginEmailVerification(input);
  const uid = await confirmEmailVerification(pending.token, await sentCode(input.email), null);
  const own = await snapshot(uid);
  assert.deepEqual(own.account, { email: input.email, emailVerified: true });
  const anonymous = await snapshot(null);
  assert.equal(anonymous.account, null);
  assert.equal(JSON.stringify(anonymous).includes(input.email), false);
});
