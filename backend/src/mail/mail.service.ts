import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { APP_CONFIG, AppConfig } from '../config/app-config';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport?: Transporter;
  /** Driver "memory": mensagens ficam aqui para os testes lerem os links. */
  readonly outbox: MailMessage[] = [];

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    const smtp = config.mail.smtp;
    if (config.mail.driver === 'smtp' && smtp) {
      this.transport = createTransport({
        host: smtp.host, port: smtp.port, secure: smtp.secure,
        auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
      });
    }
  }

  async send(msg: MailMessage): Promise<void> {
    switch (this.config.mail.driver) {
      case 'memory':
        this.outbox.push(msg);
        return;
      case 'log':
        // Apenas desenvolvimento (bloqueado em staging/produção por loadConfig).
        this.logger.log(`E-mail para ${msg.to} — ${msg.subject}\n${msg.text}`);
        return;
      default:
        await this.transport!.sendMail({ from: this.config.mail.from, ...msg });
    }
  }

  sendInvitation(to: string, params: { institution: string; role: string; link: string; expiresAt: Date }) {
    const papel = params.role === 'coordinator' ? 'coordenador(a) pedagógico(a)' : 'professor(a)';
    const validade = params.expiresAt.toLocaleDateString('pt-BR');
    return this.send({
      to,
      subject: `Convite: ${params.institution} — Formação para Professores`,
      text: `Você foi convidado(a) como ${papel} da instituição ${params.institution}.\n\nCrie seu acesso em: ${params.link}\n\nO link é pessoal, vale até ${validade} e só pode ser usado uma vez.`,
      html: `<p>Você foi convidado(a) como <b>${papel}</b> da instituição <b>${escape(params.institution)}</b>.</p>`
        + `<p><a href="${escape(params.link)}">Criar meu acesso</a></p>`
        + `<p>O link é pessoal, vale até ${validade} e só pode ser usado uma vez.</p>`,
    });
  }

  sendPasswordReset(to: string, params: { link: string; minutes: number }) {
    return this.send({
      to,
      subject: 'Redefinição de senha — Formação para Professores',
      text: `Recebemos um pedido para redefinir sua senha.\n\nUse o link (válido por ${params.minutes} minutos): ${params.link}\n\nSe não foi você, ignore este e-mail.`,
      html: `<p>Recebemos um pedido para redefinir sua senha.</p><p><a href="${escape(params.link)}">Redefinir senha</a> (válido por ${params.minutes} minutos)</p>`
        + '<p>Se não foi você, ignore este e-mail.</p>',
    });
  }
}
