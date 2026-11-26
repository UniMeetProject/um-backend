import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types/jwt-payload.js';
import { GroupsService } from './groups.service.js';

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  myInvitations(@CurrentUser() user: AuthenticatedUser) {
    return this.groups.getMyInvitations(user.id);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  accept(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.groups.acceptInvitation(id, user.id);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  decline(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.groups.declineInvitation(id, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.groups.revokeInvitation(id, user.id);
  }
}
