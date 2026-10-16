import { Global, Module } from '@nestjs/common';
import { EntitlementsService } from './entitlements.service';
import { ProgressService } from './progress.service';

@Global()
@Module({ providers: [EntitlementsService, ProgressService], exports: [EntitlementsService, ProgressService] })
export class EntitlementsModule {}
