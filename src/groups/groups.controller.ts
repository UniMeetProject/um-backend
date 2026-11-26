import {
  Body,
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
import { CreateGroupDto } from './dto/create-group.dto.js';
import { InviteDto } from './dto/invite.dto.js';
import { GroupsService } from './groups.service.js';

@Controller('groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateGroupDto) {
    return this.groups.createGroup(user.id, dto.name, dto.memberIdentifiers);
  }

  @Get()
  myGroups(@CurrentUser() user: AuthenticatedUser) {
    return this.groups.getMyGroups(user.id);
  }

  @Get(':id')
  details(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.groups.getGroupDetails(id, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.groups.deleteGroup(id, user.id);
  }

  @Post(':id/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  leave(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.groups.leaveGroup(id, user.id);
  }

  @Post(':id/invitations')
  invite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: InviteDto,
  ) {
    return this.groups.invite(id, user.id, dto.identifiers);
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.groups.removeMember(id, user.id, userId);
  }
}
