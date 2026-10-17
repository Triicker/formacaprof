import { createHash } from 'node:crypto';

type Req = { ip?: string; path?: string; url?: string; body?: unknown; cookies?: Record<string, unknown> };

/** Rotas públicas em que o e-mail digitado identifica quem está tentando. */
const ROTAS_POR_EMAIL = /\/auth\/(login|forgot-password)$/;

/**
 * Rastreadores do limite de requisições.
 *
 * Numa escola, todos saem para a internet pelo mesmo endereço (IP). Limitar só por IP faria a turma
 * inteira dividir a cota de uma pessoa. Por isso há dois limites:
 * - `pessoa` (throttler "default"): login e "esqueci a senha" contam por e-mail + IP; com sessão, conta
 *   por sessão; sem nada disso, por IP;
 * - `ip` (throttler "ip"): teto alto por endereço, só contra abuso em massa.
 * O bloqueio da conta após senhas erradas continua no banco (AuthService), independente destes limites.
 */
export function rateLimitTrackers(sessionCookieName: string) {
  const ip = (req: Req) => `ip:${req.ip ?? 'desconhecido'}`;
  const pessoa = (req: Req) => {
    const caminho = (req.path ?? req.url ?? '').split('?')[0];
    const email = (req.body as { email?: unknown } | undefined)?.email;
    if (ROTAS_POR_EMAIL.test(caminho) && typeof email === 'string' && email.trim()) {
      return `email:${email.trim().toLowerCase()}|${ip(req)}`;
    }
    const sessao = req.cookies?.[sessionCookieName];
    if (typeof sessao === 'string' && sessao) {
      // Só o hash do token entra na chave: o token em si nunca fica guardado em memória de contadores.
      return `sessao:${createHash('sha256').update(sessao).digest('hex').slice(0, 32)}`;
    }
    return ip(req);
  };
  return { ip, pessoa };
}
