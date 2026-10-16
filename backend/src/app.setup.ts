import { BadRequestException, INestApplication, ValidationError, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { timingSafeEqual } from 'node:crypto';
import { AppConfig } from './config/app-config';

export const CSRF_HEADER = 'x-csrf-protection';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function flatten(errors: ValidationError[], parent = ''): string[] {
  return errors.flatMap((e) => {
    const path = parent ? `${parent}.${e.property}` : e.property;
    const own = Object.entries(e.constraints ?? {}).map(([key, msg]) =>
      key === 'whitelistValidation' ? `Campo não permitido: ${path}.` : msg);
    return [...own, ...flatten(e.children ?? [], path)];
  });
}

/**
 * Proteção CSRF para sessão em cookie: requisições que alteram dados precisam do cabeçalho
 * X-CSRF-Protection (que um site de terceiros não consegue enviar sem CORS) e, quando o
 * navegador informa Origin, ela deve ser a do próprio frontend.
 */
function csrf(config: AppConfig) {
  const allowed = new Set([...config.allowedOrigins, ...config.corsOrigins]);
  return (req: Request, res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get('origin');
    const sameOrigin = origin === `${req.protocol}://${req.get('host')}`;
    if (req.get(CSRF_HEADER) !== '1' || (origin && !allowed.has(origin) && !sameOrigin)) {
      return res.status(403).json({ statusCode: 403, message: 'Requisição bloqueada pela proteção CSRF.' });
    }
    next();
  };
}

/** Garante que a API só seja usada através do proxy /api do Cloudflare Pages (que injeta o segredo). */
function requireProxySecret(secret: string) {
  const expected = Buffer.from(secret);
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/api/v1/health') return next();
    const got = Buffer.from(req.get('x-proxy-secret') ?? '');
    if (got.length === expected.length && timingSafeEqual(got, expected)) return next();
    res.status(403).json({ statusCode: 403, message: 'Acesso direto à API não permitido.' });
  };
}

export function configureApp(app: INestApplication, config: AppConfig): void {
  const express = app as NestExpressApplication;
  express.set('trust proxy', config.trustProxy);
  express.disable('x-powered-by');
  if (config.proxySecret) app.use(requireProxySecret(config.proxySecret));

  // API só responde JSON; a CSP padrão do helmet bloquearia a interface do Swagger.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cookieParser());
  app.use(csrf(config));
  if (config.corsOrigins.length) {
    app.enableCors({ origin: config.corsOrigins, credentials: true, allowedHeaders: ['Content-Type', 'X-CSRF-Protection'] });
  }

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => {
      const messages = flatten(errors);
      return new BadRequestException({ statusCode: 400, message: messages[0] ?? 'Dados inválidos.', errors: messages });
    },
  }));
  app.enableShutdownHooks();

  if (config.swaggerEnabled) {
    const doc = new DocumentBuilder()
      .setTitle('Formação para Professores — API')
      .setDescription(
        'API v1. Autenticação por cookie de sessão HttpOnly (POST /api/v1/auth/login). '
        + 'Requisições que alteram dados exigem o cabeçalho X-CSRF-Protection: 1.',
      )
      .setVersion('1.0')
      .addCookieAuth(config.sessionCookieName)
      .build();
    SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, doc), {
      jsonDocumentUrl: 'api/docs/openapi.json',
      swaggerOptions: {
        withCredentials: true,
        requestInterceptor: (req: { headers: Record<string, string> }) => {
          req.headers['X-CSRF-Protection'] = '1';
          return req;
        },
      },
    });
  }
}
