// Credenciais são lidas somente pelo servidor. Nenhum fallback de remetente.
export function createResetMailer(env = process.env, transport = fetch) {
  const key = env.RESEND_API_KEY?.trim();
  const from = env.RESEND_FROM?.trim();
  if (!key || !from || /[\r\n]/.test(env.RESEND_FROM) || !/^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$|^[^<>]+<[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>$/.test(from)) return null;
  return async ({ to, url }) => {
    const response = await transport('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: 'LAHVET — Troca de senha',
        text: `Para trocar sua senha, acesse: ${url}\nO link é de uso único e válido por 30 minutos. Se não solicitou, ignore este email.` }),
    });
    if (!response.ok) throw new Error('Falha no envio do email de recuperação.');
  };
}
