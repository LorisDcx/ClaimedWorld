import { EMAIL_LOGO_PNG } from './email-logo';

export const EMAIL_LOGO_CID = 'claimed-world-mark';
export function verificationEmail(code: string) {
  if (!/^\d{6}$/.test(code)) throw new Error('Invalid verification code');
  const text = `Le monde vous attend.\n\nVotre code CLAIMED.WORLD : ${code}\n\nSaisissez-le dans la fenêtre du jeu où vous avez demandé ce code pour vérifier votre adresse et rejoindre la carte. Il expire dans 10 minutes et ne peut être utilisé qu’une seule fois.\n\nGardez ce code pour vous. L’équipe ne vous le demandera jamais par message. Si vous n’avez rien demandé, vous pouvez ignorer cet e-mail.\n\nÀ vous de choisir votre place.\nCLAIMED.WORLD\nhttps://claimed-world.vercel.app/`;
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>Votre code CLAIMED.WORLD</title>
<style>body{margin:0;padding:0}table{border-collapse:collapse}a{color:inherit}@media only screen and (max-width:480px){.outer{padding:16px 10px!important}.content{padding:30px 24px!important}.hero{font-size:36px!important}.code{font-size:35px!important;letter-spacing:7px!important}.brand{font-size:17px!important}.footer{padding:24px!important}}</style></head>
<body style="margin:0;padding:0;background-color:#f2f2f2;color:#111111;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f2f2f2;mso-hide:all">Votre code pour rejoindre la carte. Valable 10 minutes.</div>
<table role="presentation" width="100%" bgcolor="#f2f2f2" style="background-color:#f2f2f2"><tr><td class="outer" align="center" style="padding:40px 16px">
<!--[if mso]><table role="presentation" width="560"><tr><td><![endif]-->
<table role="presentation" width="100%" style="max-width:560px;border:1px solid #dedede;background-color:#ffffff" bgcolor="#ffffff">
<tr><td style="padding:24px 28px;border-bottom:1px solid #dedede"><table role="presentation" width="100%"><tr><td width="54"><img src="cid:${EMAIL_LOGO_CID}" width="44" height="44" alt="" style="display:block;border:0;width:44px;height:44px"></td><td><div class="brand" style="font-size:20px;font-weight:800;letter-spacing:-0.7px;line-height:24px;color:#111111">CLAIMED.WORLD</div><div style="font-family:Consolas,'Courier New',monospace;font-size:8px;letter-spacing:1.4px;line-height:18px;color:#777777">THE WORLD IS UP FOR GRABS.</div></td><td align="right" style="font-family:Consolas,'Courier New',monospace;font-size:10px;color:#777777">01 / ACCÈS</td></tr></table></td></tr>
<tr><td class="content" bgcolor="#111111" style="padding:38px 36px 40px;background-color:#111111;color:#ffffff"><p style="margin:0 0 18px;font-family:Consolas,'Courier New',monospace;font-size:10px;letter-spacing:2px;line-height:16px;color:#bdbdbd">UNE CARTE. VOTRE COULEUR.</p><h1 class="hero" style="margin:0;font-size:44px;line-height:1.07;font-weight:700;letter-spacing:-1.7px;color:#ffffff">Le monde<br>vous attend.</h1><p style="margin:22px 0 0;font-size:15px;line-height:24px;color:#d2d2d2">Il ne reste qu’une étape : confirmer votre adresse e-mail pour rejoindre la carte.</p></td></tr>
<tr><td class="content" style="padding:34px 36px 32px;background-color:#ffffff;color:#111111"><p style="margin:0 0 14px;font-family:Consolas,'Courier New',monospace;font-size:10px;letter-spacing:1.6px;color:#777777">VOTRE CODE DE VÉRIFICATION</p>
<table role="presentation" width="100%" style="border:1px solid #111111;background-color:#fafafa" bgcolor="#fafafa"><tr><td class="code" align="center" style="padding:22px 10px;font-family:Consolas,'Courier New',monospace;font-size:44px;line-height:52px;font-weight:700;letter-spacing:10px;color:#111111">${code}</td></tr></table>
<table role="presentation" width="100%"><tr><td style="padding:12px 0 22px;font-family:Consolas,'Courier New',monospace;font-size:10px;color:#777777">10 MINUTES</td><td align="right" style="padding:12px 0 22px;font-family:Consolas,'Courier New',monospace;font-size:10px;color:#777777">USAGE UNIQUE</td></tr></table>
<p style="margin:0;font-size:14px;line-height:23px;color:#555555">Saisissez ces six chiffres dans la fenêtre du jeu où vous avez demandé ce code. Ensuite, à vous de choisir votre place.</p>
<p style="margin:24px 0 0;font-size:14px;line-height:23px;font-weight:700;color:#111111">Un pays pour commencer.<br>Une communauté pour aller plus loin.</p></td></tr>
<tr><td class="footer" style="padding:24px 36px;border-top:1px solid #dedede;background-color:#fafafa;color:#777777"><p style="margin:0;font-size:11px;line-height:18px">Gardez ce code pour vous. L’équipe ne vous le demandera jamais par message. Si vous n’avez rien demandé, vous pouvez simplement ignorer cet e-mail.</p><p style="margin:16px 0 0;font-size:11px;line-height:18px"><a href="https://claimed-world.vercel.app/" style="color:#111111;text-decoration:underline">CLAIMED.WORLD</a> &nbsp;·&nbsp; La conquête est gratuite.</p></td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  return {
    subject: 'Votre code pour rejoindre CLAIMED.WORLD',
    text,
    html,
    attachments: [
      {
        filename: 'claimed-world.png',
        content: Buffer.from(EMAIL_LOGO_PNG, 'base64'),
        contentType: 'image/png',
        cid: EMAIL_LOGO_CID,
        contentDisposition: 'inline' as const,
      },
    ],
  };
}
