import { BadRequestException, Injectable } from '@nestjs/common';
import { hash, verify, type Algorithm } from '@node-rs/argon2';

// Argon2id com os parâmetros mínimos recomendados pela OWASP (19 MiB, t=2, p=1).
const OPTIONS = { algorithm: 2 as Algorithm, memoryCost: 19456, timeCost: 2, parallelism: 1 };

// Caracteres invisíveis que vêm junto ao copiar e colar (espaço de largura zero, BOM, etc.).
const INVISIVEIS = /[\u200B-\u200D\u2060\uFEFF]/g;
/** Senha sem espaços nas pontas nem caracteres invisíveis — o que a pessoa quis digitar ao colar. */
export const limparSenha = (p: string) => p.replace(INVISIVEIS, '').trim();

/** Senhas novas não podem ter espaço nas pontas: evita a ambiguidade de "colei com um espaço". */
export function assertSenhaSemEspacosNasPontas(p: string) {
  if (limparSenha(p) !== p) throw new BadRequestException('A senha não pode começar nem terminar com espaço.');
}

@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return hash(password, OPTIONS);
  }

  /**
   * Confere a senha exatamente como veio; se não bater e ela tiver espaço ou caractere invisível nas
   * pontas (comum ao copiar e colar), confere a versão limpa. Quem tem senha com espaço de propósito
   * continua entrando pela primeira comparação.
   */
  async verify(passwordHash: string, password: string): Promise<boolean> {
    if (await this.verifyExact(passwordHash, password)) return true;
    const limpa = limparSenha(password);
    return limpa !== password && limpa.length > 0 && this.verifyExact(passwordHash, limpa);
  }

  private async verifyExact(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  /** Gasta o mesmo tempo de uma verificação real quando o e-mail não existe (evita enumeração por tempo). */
  async verifyDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash('senha-inexistente-para-igualar-tempo');
    await this.verify(await this.dummyHash, password);
  }
}
