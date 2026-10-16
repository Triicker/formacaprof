// Cloudflare Pages Function: proxy de mesma origem /api/* → API no Render.
// O navegador só conversa com o domínio do Pages, então o cookie de sessão é first-party
// (sem depender de cookies de terceiros entre pages.dev e onrender.com).
//
// Variáveis do projeto Pages (Settings → Variables and Secrets):
//   API_ORIGIN    https://formacaprof-api.onrender.com   (sem barra no final)
//   PROXY_SECRET  mesmo valor configurado na API (tipo "Secret")

const HOP_BY_HOP = ['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'host', 'cf-connecting-ip', 'x-forwarded-for', 'x-proxy-secret'];

export async function onRequest({ request, env }) {
  if (!env.API_ORIGIN) {
    return Response.json({ statusCode: 503, message: 'API não configurada (API_ORIGIN).' }, { status: 503 });
  }

  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, env.API_ORIGIN);

  const headers = new Headers(request.headers);
  for (const h of HOP_BY_HOP) headers.delete(h);
  // IP real do cliente informado pela Cloudflare; sobrescreve qualquer X-Forwarded-For enviado pelo navegador.
  headers.set('x-forwarded-for', request.headers.get('cf-connecting-ip') ?? '');
  headers.set('x-forwarded-proto', 'https');
  headers.set('x-forwarded-host', url.host);
  if (env.PROXY_SECRET) headers.set('x-proxy-secret', env.PROXY_SECRET);

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: 'manual',
  });

  // Repassa status, corpo e cabeçalhos (inclusive Set-Cookie, que fica no domínio do Pages).
  const response = new Response(upstream.body, upstream);
  response.headers.set('cache-control', 'no-store');
  return response;
}
