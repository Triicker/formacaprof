import { Injectable } from '@nestjs/common';
import { hash, verify, type Algorithm } from '@node-rs/argon2';

// Argon2id com os parâmetros mínimos recomendados pela OWASP (19 MiB, t=2, p=1).
const OPTIONS = { algorithm: 2 as Algorithm, memoryCost: 19456, timeCost: 2, parallelism: 1 };

@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return hash(password, OPTIONS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
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
