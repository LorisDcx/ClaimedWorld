import domains from 'disposable-email-domains';
import { z } from 'zod';

const disposable = new Set(domains);
for (const domain of ['tempmail.com', 'temp-mail.org', 'mail.tm']) disposable.add(domain);
// Keep explicit coverage of the services named by players, including aliases.
for (const domain of [
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'yopmail.org',
  'yopmail.gq',
  'yopmail.xyz',
  'yopmail.cloud',
  'yopmail.email',
  'yopmail.me',
  'yopmail.pro',
  'yopmail.fun',
  'yopmail.site',
  'yopmail.online',
])
  disposable.add(domain);

export function emailIdentity(value: unknown) {
  const email = z
    .email()
    .max(254)
    .parse(typeof value === 'string' ? value.trim().toLowerCase() : value);
  const [local, domain] = email.split('@');
  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i++)
    if (disposable.has(parts.slice(i).join('.')))
      throw new Error(
        'Les adresses e-mail temporaires ne sont pas acceptées. Utilisez une adresse durable.',
      );
  if (['gmail.com', 'googlemail.com'].includes(domain)) {
    const account = local.split('+')[0].replaceAll('.', '');
    if (!account) throw new Error('Adresse e-mail invalide.');
    return { email, key: `${account}@gmail.com` };
  }
  // Plus addressing is documented for these providers. Do not rewrite arbitrary domains.
  if (
    [
      'outlook.com',
      'outlook.fr',
      'hotmail.com',
      'hotmail.fr',
      'live.com',
      'live.fr',
      'icloud.com',
      'proton.me',
      'protonmail.com',
    ].includes(domain)
  )
    return { email, key: `${local.split('+')[0]}@${domain}` };
  return { email, key: email };
}

export const MIN_PASSWORD_LENGTH = 8;
const commonPasswords = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  '1234567890',
  'azertyui',
  'azerty123',
  'qwerty123',
  'qwertyuiop',
  'motdepasse',
  'abcdefgh',
]);
export function registrationPassword(value: unknown, username: string) {
  const password = z.string().min(MIN_PASSWORD_LENGTH).max(128).parse(value);
  if (
    commonPasswords.has(password.toLowerCase()) ||
    password.toLowerCase() === username.toLowerCase()
  )
    throw new Error('Ce mot de passe est trop facile à deviner. Choisissez-en un autre.');
  return password;
}
