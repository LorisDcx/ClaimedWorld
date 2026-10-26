import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function checkPassword(password: string, hash: string) {
  if (!hash.includes(':')) return false;
  const [salt, stored] = hash.split(':');
  const computed = scryptSync(password, salt, 64);
  const expected = Buffer.from(stored, 'hex');
  return expected.length === computed.length && timingSafeEqual(expected, computed);
}
