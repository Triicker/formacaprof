import { Controller, DynamicModule, Get, Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccessModule } from './access/access.module';
import { AdminCatalogModule } from './admin/admin-catalog.module';
import { AdminInstitutionsModule } from './admin/admin-institutions.module';
import { ContentAdminModule } from './content/content-admin.module';
import { MediaAdminModule } from './media/media-admin.module';
import { ReportingModule } from './reporting/reporting.module';
import { CatalogModule } from './catalog/catalog.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { EntitlementsModule } from './entitlements/entitlements.module';
import { LearningModule } from './learning/learning.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { SessionGuard } from './auth/session.guard';
import { Public } from './common/decorators';
import { rateLimitTrackers } from './common/rate-limit';
import { APP_CONFIG, AppConfig } from './config/app-config';
import { InstitutionsModule } from './institutions/institutions.module';
import { InvitationsModule } from './invitations/invitations.module';
import { MailModule } from './mail/mail.module';
import { MembershipsModule } from './memberships/memberships.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { UsersModule } from './users/users.module';

@ApiTags('Infraestrutura')
@Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @SkipThrottle({ default: true, ip: true })
  @Get()
  @ApiOperation({ summary: 'Verificação de saúde (usada pelo Render)' })
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}

@Global()
@Module({})
class ConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return { module: ConfigModule, providers: [{ provide: APP_CONFIG, useValue: config }], exports: [APP_CONFIG] };
  }
}

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    const rastreio = rateLimitTrackers(config.sessionCookieName);
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        ThrottlerModule.forRoot({
          // default = por pessoa (sessão, ou e-mail + IP no login); ip = teto por endereço (escola inteira).
          throttlers: [
            { name: 'default', ttl: 60_000, limit: 300, getTracker: rastreio.pessoa },
            { name: 'ip', ttl: 60_000, limit: 3_000, getTracker: rastreio.ip },
          ],
          skipIf: () => !config.rateLimitEnabled,
          errorMessage: 'Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente.',
        }),
        PrismaModule,
        AccessModule,
        AuditModule,
        MailModule,
        AuthModule,
        UsersModule,
        OrganizationsModule,
        InstitutionsModule,
        MembershipsModule,
        InvitationsModule,
        EntitlementsModule,
        CatalogModule,
        LearningModule,
        EnrollmentsModule,
        AdminCatalogModule,
        AdminInstitutionsModule,
        ContentAdminModule,
        MediaAdminModule,
        ReportingModule,
      ],
      controllers: [HealthController],
      // Ordem importa: limite de requisições antes da verificação de sessão.
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: SessionGuard },
      ],
    };
  }
}
