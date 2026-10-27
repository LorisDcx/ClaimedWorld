import nextEnv from '@next/env';
import { execFileSync } from 'node:child_process';
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const keys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'];
for (const key of keys) {
  const value = process.env[key];
  if (!value) throw new Error(`Configurez ${key} dans le fichier privé.`);
  try {
    execFileSync(
      'cmd.exe',
      [
        '/d',
        '/s',
        '/c',
        `npx --yes vercel@65.3.1 env add ${key} --environment production --force --sensitive --yes --project claimed-world --scope lorisds-projects-ad5036e6`,
      ],
      {
        input: value + '\n',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60000,
      },
    );
    console.log(`${key} configuré sur Vercel. Aucune valeur affichée.`);
  } catch {
    throw new Error(`Configuration de ${key} interrompue. Aucun secret affiché.`);
  }
}
