import { mkdir, writeFile } from 'node:fs/promises';
import { verificationEmail, EMAIL_LOGO_CID } from '../src/lib/email-template';
import { loadEnvConfig } from '@next/env';
import { smtpTransport } from '../src/lib/email-delivery';
async function main() {
  // The preview uses an inert example code. It never creates a verification request.
  const message = verificationEmail('482193');
  const logo = message.attachments[0];
  const html = message.html.replace(
    `cid:${EMAIL_LOGO_CID}`,
    `data:image/png;base64,${logo.content.toString('base64')}`,
  );
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/verification-email.html', html);
  console.log('Aperçu local enregistré dans artifacts/verification-email.html.');
  if (process.argv.includes('--send')) {
    loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
    if (process.env.SMTP_USER !== 'lorisdcx.pro@gmail.com')
      throw new Error('Compte de prévisualisation non autorisé.');
    const transport = smtpTransport();
    try {
      await transport.sendMail({
        from: { name: 'CLAIMED.WORLD', address: process.env.SMTP_FROM! },
        to: process.env.SMTP_USER,
        ...message,
        subject: 'Aperçu du nouveau mail CLAIMED.WORLD',
        text:
          'Aperçu de design uniquement. Le code ci-dessous est fictif et n’active aucun compte.\n\n' +
          message.text,
        html: message.html.replace(
          'Votre code pour rejoindre la carte. Valable 10 minutes.',
          'Aperçu du design. Code fictif, sans activation de compte.',
        ),
      });
      console.log('Aperçu accepté par Gmail pour le compte de l’exploitant.');
    } finally {
      transport.close();
    }
  }
}
void main().catch((error: unknown) => {
  const reason = error instanceof Error ? error.name : 'Unknown';
  console.error(
    `Impossible de préparer ou envoyer l’aperçu du mail (${reason}). Aucun secret affiché.`,
  );
  process.exitCode = 1;
});
