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
import { AddProposalDto } from './dto/add-proposal.dto.js';
import { CreateAppointmentDto } from './dto/create-appointment.dto.js';
import { FinalizeDto } from './dto/finalize.dto.js';
import { AppointmentsService } from './appointments.service.js';

@Controller()
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Post('groups/:groupId/appointments')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.appointments.create(groupId, user.id, dto);
  }

  @Get('groups/:groupId/appointments')
  listForGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
  ) {
    return this.appointments.listForGroup(groupId, user.id);
  }

  @Get('appointments/:id')
  details(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.appointments.getDetails(id, user.id);
  }

  @Get('appointments/:id/status')
  status(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.appointments.getStatus(id, user.id);
  }

  @Post('appointments/:id/finalize')
  @HttpCode(HttpStatus.OK)
  finalize(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: FinalizeDto,
  ) {
    return this.appointments.finalize(id, user.id, dto.proposalId);
  }

  @Delete('appointments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.appointments.remove(id, user.id);
  }

  @Post('appointments/:id/proposals')
  addProposal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddProposalDto,
  ) {
    return this.appointments.addProposal(id, user.id, dto);
  }

  @Delete('appointments/:id/proposals/:proposalId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeProposal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('proposalId') proposalId: string,
  ) {
    return this.appointments.removeProposal(id, proposalId, user.id);
  }

  @Post('appointments/:id/proposals/:proposalId/votes')
  @HttpCode(HttpStatus.OK)
  vote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('proposalId') proposalId: string,
  ) {
    return this.appointments.vote(id, proposalId, user.id);
  }

  @Delete('appointments/:id/proposals/:proposalId/votes')
  @HttpCode(HttpStatus.NO_CONTENT)
  unvote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('proposalId') proposalId: string,
  ) {
    return this.appointments.unvote(id, proposalId, user.id);
  }
}
