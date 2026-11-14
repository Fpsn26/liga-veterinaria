const descriptions = {
  400: ['Solicitação inválida', 'Confira os dados informados e tente novamente.'],
  401: ['Autenticação necessária', 'Entre na sua conta para acessar esta página. Sua sessão pode ter expirado.'],
  403: ['Acesso não permitido', 'Sua conta não tem permissão para acessar este conteúdo.'],
  404: ['Página não encontrada', 'O endereço pode ter mudado ou o conteúdo não está mais disponível.'],
  405: ['Operação não permitida', 'Esta ação não está disponível neste endereço.'],
  409: ['Não foi possível concluir esta ação', 'Os dados podem ter sido atualizados. Confira a página antes de tentar novamente.'],
  413: ['Arquivo ou solicitação muito grande', 'Os anexos devem ter até 4 MB por arquivo. Escolha um arquivo menor.'],
  415: ['Formato não permitido', 'Para os anexos, use um arquivo PDF, JPG ou PNG válido.'],
  422: ['Dados incompletos ou inválidos', 'Revise os campos solicitados antes de continuar.'],
  429: ['Muitas tentativas', 'Aguarde alguns minutos antes de tentar novamente.'],
  500: ['Ocorreu um erro', 'Não foi possível concluir a operação agora. Tente novamente em instantes.'],
  503: ['Serviço temporariamente indisponível', 'Estamos com dificuldade para atender sua solicitação. Tente novamente em instantes.'],
};

export function renderErrorPage(status) {
  const [title, description] = descriptions[status] ?? descriptions[500];
  const primary = status === 401 ? '<a class="button-link" href="/pages/login.html">Entrar na minha conta</a>'
    : status === 403 ? '<a class="button-link" href="/pages/painel.html">Ir ao meu painel</a>'
      : [429, 500, 503].includes(status) ? '<button id="retry-page" type="button">Tentar novamente</button>' : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${status} — ${title} | LAHVET</title><link rel="icon" href="/assets/images/favicon.png" type="image/png">
<link rel="stylesheet" href="/assets/css/style.css"><script src="/assets/js/error-page.js" defer></script></head>
<body><main class="error-page"><section class="error-card" aria-labelledby="error-title">
<img class="brand-logo brand-logo--small" src="/assets/images/lahvet-logo.png" alt="LAHVET — Liga Acadêmica de Hematologia Veterinária" width="777" height="768">
<p class="error-code">${status}</p><h1 id="error-title">${title}</h1><p>${description}</p>
<nav class="error-actions" aria-label="Opções para continuar">${primary}<a class="button-link button-link--secondary" href="/">Voltar ao início</a></nav>
<p class="error-help">Se o problema continuar, procure a direção da liga.</p></section></main></body></html>`;
}

export function wantsErrorHtml(req) {
  const path = (req.originalUrl ?? req.url ?? req.path ?? '/').split('?')[0];
  if (path === '/api' || path.startsWith('/api/')) return false;
  const accept = req.headers?.accept ?? '';
  return accept.includes('text/html') || (!accept.includes('application/json') && (path === '/' || path.endsWith('.html')));
}

export function sendError(req, res, status, message) {
  const safeStatus = Object.hasOwn(descriptions, status) ? status : 500;
  res.statusCode = safeStatus;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (wantsErrorHtml(req)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(renderErrorPage(safeStatus));
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify({ error: message ?? descriptions[safeStatus][0] + '.' }));
}
