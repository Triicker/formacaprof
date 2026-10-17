import { createHash, randomBytes } from 'node:crypto';

/** Token opaco de 256 bits para cookies, convites e redefinição de senha. */
export const newToken = (): string => randomBytes(32).toString('base64url');

/** Apenas o hash é persistido: um vazamento do banco não revela tokens utilizáveis. */
export const hashToken = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex');

// Remove também caracteres invisíveis que vêm ao copiar e colar o e-mail.
export const normalizeEmail = (email: string): string => email.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim().toLowerCase();

export function slugify(text: string): string {
  return text
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'item';
}

/** Para @Transform dos DTOs: normaliza o e-mail antes da validação. */
export const toNormalizedEmail = ({ value }: { value: unknown }) => (typeof value === 'string' ? normalizeEmail(value) : value);
