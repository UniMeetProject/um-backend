import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Appointment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { GroupsService } from '../groups/groups.service.js';
import { CreateAppointmentDto } from './dto/create-appointment.dto.js';
import { AddProposalDto } from './dto/add-proposal.dto.js';

interface ProposalTimes {
  startsAt: string;
  endsAt?: string;
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly groups: GroupsService,
  ) {}

  async create(groupId: string, userId: string, dto: CreateAppointmentDto) {
    await this.groups.assertMember(groupId, userId);
    const votingDeadline = this.parseFutureDate(dto.votingDeadline, 'votingDeadline');
    const proposals = (dto.proposals ?? []).map((proposal) =>
      this.toProposalData(proposal, userId),
    );
    return this.prisma.appointment.create({
      data: {
        groupId,
        createdById: userId,
        title: dto.title,
        description: dto.description ?? null,
        votingDeadline,
        proposals: proposals.length > 0 ? { create: proposals } : undefined,
      },
      include: { proposals: { orderBy: { startsAt: 'asc' } } },
    });
  }

  async listForGroup(groupId: string, userId: string) {
    await this.groups.assertMember(groupId, userId);
    return this.prisma.appointment.findMany({
      where: { groupId },
      include: {
        createdBy: { select: { id: true, username: true } },
        _count: { select: { proposals: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDetails(appointmentId: string, userId: string) {
    const appointment = await this.loadAppointmentOrThrow(appointmentId);
    await this.groups.assertMember(appointment.groupId, userId);
    return this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        createdBy: { select: { id: true, username: true } },
        proposals: {
          orderBy: { startsAt: 'asc' },
          include: {
            proposedBy: { select: { id: true, username: true } },
            _count: { select: { votes: true } },
          },
        },
      },
    });
  }

  async getStatus(appointmentId: string, userId: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        proposals: {
          orderBy: { startsAt: 'asc' },
          include: {
            votes: { include: { user: { select: { id: true, username: true } } } },
          },
        },
      },
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    await this.groups.assertMember(appointment.groupId, userId);

    const remainingMs = Math.max(0, appointment.votingDeadline.getTime() - Date.now());
    const proposals = appointment.proposals.map((proposal) => ({
      id: proposal.id,
      startsAt: proposal.startsAt,
      endsAt: proposal.endsAt,
      voteCount: proposal.votes.length,
      voters: proposal.votes.map((vote) => ({
        id: vote.user.id,
        username: vote.user.username,
      })),
      votedByMe: proposal.votes.some((vote) => vote.userId === userId),
      isFinal: appointment.finalProposalId === proposal.id,
    }));

    return {
      id: appointment.id,
      groupId: appointment.groupId,
      title: appointment.title,
      description: appointment.description,
      status: appointment.status,
      votingDeadline: appointment.votingDeadline,
      remainingMs,
      remainingSeconds: Math.floor(remainingMs / 1000),
      votingClosed: appointment.status !== 'OPEN' || remainingMs === 0,
      finalProposalId: appointment.finalProposalId,
      totalVoters: new Set(
        appointment.proposals.flatMap((proposal) =>
          proposal.votes.map((vote) => vote.userId),
        ),
      ).size,
      proposals,
    };
  }

  async addProposal(appointmentId: string, userId: string, dto: AddProposalDto) {
    const appointment = await this.loadAppointmentOrThrow(appointmentId);
    await this.groups.assertMember(appointment.groupId, userId);
    this.assertVotable(appointment);
    return this.prisma.proposal.create({
      data: { appointmentId, ...this.toProposalData(dto, userId) },
    });
  }

  async removeProposal(
    appointmentId: string,
    proposalId: string,
    userId: string,
  ): Promise<void> {
    const appointment = await this.loadAppointmentOrThrow(appointmentId);
    const membership = await this.groups.assertMember(appointment.groupId, userId);
    const proposal = await this.assertProposalBelongs(proposalId, appointmentId);
    const isManager =
      appointment.createdById === userId || membership.role === 'OWNER';
    if (proposal.proposedById !== userId && !isManager) {
      throw new ForbiddenException('You can only remove your own proposals');
    }
    this.assertVotable(appointment);
    await this.prisma.proposal.delete({ where: { id: proposalId } });
  }

  async vote(appointmentId: string, proposalId: string, userId: string) {
    const appointment = await this.loadAppointmentOrThrow(appointmentId);
    await this.groups.assertMember(appointment.groupId, userId);
    this.assertVotable(appointment);
    await this.assertProposalBelongs(proposalId, appointmentId);
    await this.prisma.vote.upsert({
      where: { proposalId_userId: { proposalId, userId } },
      create: { proposalId, userId },
      update: {},
    });
    return this.getStatus(appointmentId, userId);
  }

  async unvote(
    appointmentId: string,
    proposalId: string,
    userId: string,
  ): Promise<void> {
    const appointment = await this.loadAppointmentOrThrow(appointmentId);
    await this.groups.assertMember(appointment.groupId, userId);
    this.assertVotable(appointment);
    await this.assertProposalBelongs(proposalId, appointmentId);
    await this.prisma.vote.deleteMany({ where: { proposalId, userId } });
  }

  async finalize(appointmentId: string, userId: string, proposalId: string) {
    const appointment = await this.loadAppointmentOrThrow(appointmentId);
    await this.assertManager(appointment, userId);
    if (appointment.status !== 'OPEN') {
      throw new BadRequestException('Appointment is not open');
    }
    await this.assertProposalBelongs(proposalId, appointmentId);
    return this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'FINALIZED', finalProposalId: proposalId },
      include: { finalProposal: true },
    });
  }

  async remove(appointmentId: string, userId: string): Promise<void> {
    const appointment = await this.loadAppointmentOrThrow(appointmentId);
    await this.assertManager(appointment, userId);
    await this.prisma.appointment.delete({ where: { id: appointmentId } });
  }

  private async loadAppointmentOrThrow(appointmentId: string): Promise<Appointment> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    return appointment;
  }

  private async assertProposalBelongs(proposalId: string, appointmentId: string) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
    });
    if (!proposal || proposal.appointmentId !== appointmentId) {
      throw new NotFoundException('Proposal not found');
    }
    return proposal;
  }

  private async assertManager(appointment: Appointment, userId: string): Promise<void> {
    if (appointment.createdById === userId) {
      return;
    }
    const membership = await this.groups.getMembership(appointment.groupId, userId);
    if (!membership) {
      throw new ForbiddenException('You are not a member of this group');
    }
    if (membership.role !== 'OWNER') {
      throw new ForbiddenException(
        'Only the group owner or the creator can perform this action',
      );
    }
  }

  private assertVotable(appointment: Appointment): void {
    if (appointment.status !== 'OPEN') {
      throw new BadRequestException('Voting is closed for this appointment');
    }
    if (appointment.votingDeadline.getTime() <= Date.now()) {
      throw new BadRequestException('The voting deadline has passed');
    }
  }

  private toProposalData(input: ProposalTimes, userId: string) {
    const startsAt = new Date(input.startsAt);
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (endsAt && endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
    return { proposedById: userId, startsAt, endsAt };
  }

  private parseFutureDate(value: string, field: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} is not a valid date`);
    }
    if (date.getTime() <= Date.now()) {
      throw new BadRequestException(`${field} must be in the future`);
    }
    return date;
  }
}
