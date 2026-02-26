import { env } from '~/config/env';

function buildRejectedEmailText(companyName: string): string {
  return [
    `Hola equipo de ${companyName},`,
    '',
    'Les informamos que, tras la revision interna, su proceso de activacion de tarjetas no pudo ser aprobado en esta oportunidad, de acuerdo con las politicas internas de Fintoc.',
    '',
    'Si quieren mas informacion, pueden escribirnos a success@fintoc.com y con gusto los ayudamos.',
    '',
    'Saludos,',
    'Equipo Fintoc',
  ].join('\n');
}

export async function sendRejectionEmail(input: {
  contactEmail: string
  companyName: string
}): Promise<void> {
  const provider = (env.EMAIL_PROVIDER ?? '').trim().toLowerCase();
  const apiKey = env.EMAIL_API_KEY;
  const from = env.EMAIL_FROM ?? 'success@fintoc.com';

  if (!provider || !apiKey) {
    console.log('Rejection email pending setup (missing EMAIL_PROVIDER or EMAIL_API_KEY)', {
      to: input.contactEmail,
      companyName: input.companyName,
    });
    return;
  }

  const subject = 'Solicitud de activacion de tarjetas con Fintoc';
  const text = buildRejectedEmailText(input.companyName);

  if (provider === 'resend') {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.contactEmail],
        subject,
        text,
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Failed to send rejection email via Resend (${response.status}): ${details}`);
    }
    return;
  }

  console.log('Rejection email pending setup (unsupported EMAIL_PROVIDER)', {
    provider,
    to: input.contactEmail,
    companyName: input.companyName,
  });
}
