import nextEnv from '@next/env';
import { parseEnv } from 'node:util';
import { readFileSync, appendFileSync } from 'node:fs';
import nodemailer from 'nodemailer';
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const mail = parseEnv(readFileSync('.env.mail.local', 'utf8'));
const keys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'];
if (keys.some((key) => !mail[key])) throw new Error('Complétez le fichier privé .env.mail.local.');
if (
  mail.SMTP_HOST !== 'smtp.gmail.com' ||
  mail.SMTP_USER !== 'lorisdcx.pro@gmail.com' ||
  mail.SMTP_FROM !== mail.SMTP_USER
)
  throw new Error('La configuration ne correspond pas au compte Gmail autorisé.');
const transporter = nodemailer.createTransport({
  host: mail.SMTP_HOST,
  port: 465,
  secure: true,
  auth: { user: mail.SMTP_USER, pass: mail.SMTP_PASSWORD.replaceAll(' ', '') },
  tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
  connectionTimeout: 10000,
  socketTimeout: 15000,
});
try {
  await transporter.verify();
  if (process.argv.includes('--save')) {
    // Only the named mail variables are copied, never printed or committed.
    appendFileSync(
      '.env.local',
      '\n# Gmail verification email\n' + keys.map((key) => `${key}=${mail[key]}`).join('\n') + '\n',
    );
  }
  console.log('Connexion Gmail SMTP vérifiée. Aucun secret affiché.');
} catch {
  console.error(
    'Connexion Gmail refusée ou indisponible. Vérifiez le mot de passe d’application et la validation en deux étapes.',
  );
  process.exitCode = 1;
} finally {
  transporter.close();
}
