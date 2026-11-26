import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { GroupsController } from './groups.controller.js';
import { GroupsService } from './groups.service.js';
import { InvitationsController } from './invitations.controller.js';

@Module({
  imports: [UsersModule],
  controllers: [GroupsController, InvitationsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
