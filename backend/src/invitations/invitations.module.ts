import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

@Module({ imports: [AuthModule, UsersModule], controllers: [InvitationsController], providers: [InvitationsService] })
export class InvitationsModule {}
