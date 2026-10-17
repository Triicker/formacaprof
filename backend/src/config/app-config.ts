import { resolve } from 'node:path';

export type MailDriver = 'log' | 'smtp' | 'memory';

export interface AppConfig {
  env: 'development' | 'test' | 'staging' | 'production';
  port: number;
  /** URL pública do frontend, usada nos links de convite e de redefinição de senha. */
  appUrl: string;
  /** Origens aceitas no cabeçalho Origin de requisições que alteram dados. */
  allowedOrigins: string[];
  /** Só usar se o frontend chamar a API diretamente em outro domínio (sem o proxy /api). */
  corsOrigins: string[];
  trustProxy: number | false;
  /** Se definido, toda requisição (exceto /health) precisa do cabeçalho X-Proxy-Secret enviado pelo proxy do Pages. */
  proxySecret?: string;
  cookieSecure: boolean;
  sessionCookieName: string;
  sessionTtlHours: number;
  inviteTtlHours: number;
  resetTtlMinutes: number;
  loginMaxAttempts: number;
  loginLockMinutes: number;
  rateLimitEnabled: boolean;
  swaggerEnabled: boolean;
  /** Pasta dos arquivos protegidos servidos por /media/:id (provider "local"). */
  storageDir: string;
  /** Seletor de contas de teste na tela de login (só aparece enquanto houver contas de QA ativas). */
  qaQuickLogin: boolean;
  /** Limites de upload (MB). Vídeo pela API = 0 → desativado (usar link externo ou upload direto ao storage). */
  media: { maxImageMb: number; maxPdfMb: number; maxVideoMb: number; directUpload: 'none' | 'r2' };
  mail: {
    driver: MailDriver;
    from: string;
    smtp?: { host: string; port: number; secure: boolean; user?: string; pass?: string };
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');

const ENVS = ['development', 'test', 'staging', 'production'] as const;

function int(env: NodeJS.ProcessEnv, key: string, fallback: number, min = 1): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) throw new Error(`${key} deve ser um inteiro >= ${min}.`);
  return n;
}

function bool(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  if (!['true', 'false'].includes(raw)) throw new Error(`${key} deve ser "true" ou "false".`);
  return raw === 'true';
}

function list(raw: string | undefined): string[] {
  return (raw || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = (env.NODE_ENV || 'development') as AppConfig['env'];
  if (!ENVS.includes(nodeEnv)) throw new Error(`NODE_ENV inválido: ${nodeEnv}`);
  const deployed = nodeEnv === 'production' || nodeEnv === 'staging';

  if (!env.DATABASE_URL) throw new Error('DATABASE_URL é obrigatória.');
  const appUrl = (env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
  if (deployed && !appUrl.startsWith('https://')) throw new Error('APP_URL deve usar https em staging/produção.');

  const cookieSecure = bool(env, 'COOKIE_SECURE', deployed);
  if (deployed && !cookieSecure) throw new Error('COOKIE_SECURE não pode ser false em staging/produção.');

  const driver = (env.MAIL_DRIVER || (deployed ? 'smtp' : 'log')) as MailDriver;
  if (!['log', 'smtp', 'memory'].includes(driver)) throw new Error(`MAIL_DRIVER inválido: ${driver}`);
  // O driver "log" escreve links com tokens no log: proibido fora de desenvolvimento/teste.
  if (deployed && driver !== 'smtp') throw new Error('Em staging/produção, MAIL_DRIVER deve ser "smtp".');
  let smtp: AppConfig['mail']['smtp'];
  if (driver === 'smtp') {
    if (!env.SMTP_HOST) throw new Error('SMTP_HOST é obrigatório com MAIL_DRIVER=smtp.');
    smtp = {
      host: env.SMTP_HOST,
      port: int(env, 'SMTP_PORT', 587),
      secure: bool(env, 'SMTP_SECURE', false),
      user: env.SMTP_USER || undefined,
      pass: env.SMTP_PASS || undefined,
    };
  }

  const proxySecret = env.PROXY_SECRET || undefined;
  if (proxySecret && proxySecret.length < 32) throw new Error('PROXY_SECRET deve ter pelo menos 32 caracteres.');

  const trustRaw = env.TRUST_PROXY;
  const trustProxy = trustRaw === undefined || trustRaw === '' || trustRaw === 'false' ? false : int(env, 'TRUST_PROXY', 1);

  return {
    env: nodeEnv,
    port: int(env, 'PORT', 3000),
    appUrl,
    allowedOrigins: list(env.APP_ORIGINS).length ? list(env.APP_ORIGINS) : [new URL(appUrl).origin],
    corsOrigins: list(env.CORS_ORIGINS),
    trustProxy,
    proxySecret,
    cookieSecure,
    // __Host- impede que subdomínios sobrescrevam o cookie; exige Secure e Path=/.
    sessionCookieName: cookieSecure ? '__Host-fp_session' : 'fp_session',
    sessionTtlHours: int(env, 'SESSION_TTL_HOURS', 72),
    inviteTtlHours: int(env, 'INVITE_TTL_HOURS', 168),
    resetTtlMinutes: int(env, 'RESET_TTL_MINUTES', 30),
    loginMaxAttempts: int(env, 'LOGIN_MAX_ATTEMPTS', 5),
    loginLockMinutes: int(env, 'LOGIN_LOCK_MINUTES', 15),
    rateLimitEnabled: bool(env, 'RATE_LIMIT_ENABLED', true),
    swaggerEnabled: bool(env, 'SWAGGER_ENABLED', nodeEnv !== 'production'),
    storageDir: resolve(env.STORAGE_DIR || resolve(process.cwd(), 'storage')),
    qaQuickLogin: env.QA_LOGIN_RAPIDO !== 'nao',
    media: {
      maxImageMb: int(env, 'MEDIA_MAX_IMAGE_MB', 5),
      maxPdfMb: int(env, 'MEDIA_MAX_PDF_MB', 25),
      maxVideoMb: int(env, 'MEDIA_MAX_VIDEO_MB', 0, 0),
      directUpload: env.MEDIA_DIRECT_UPLOAD === 'r2' ? 'r2' : 'none',
    },
    mail: { driver, from: env.MAIL_FROM || 'Formação para Professores <nao-responda@localhost>', smtp },
  };
}
