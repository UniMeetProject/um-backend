import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  async createGroup(ownerId: string, name: string, memberIdentifiers: string[] = []) {
    const inviteeIds = (await this.resolveUsers(memberIdentifiers)).filter(
      (id) => id !== ownerId,
    );
    const group = await this.prisma.$transaction(async (tx) => {
      const created = await tx.group.create({
        data: {
          name,
          ownerId,
          memberships: { create: { userId: ownerId, role: 'OWNER' } },
        },
      });
      if (inviteeIds.length > 0) {
        await tx.groupInvitation.createMany({
          data: inviteeIds.map((invitedUserId) => ({
            groupId: created.id,
            invitedUserId,
            invitedById: ownerId,
          })),
        });
      }
      return created;
    });
    return this.getGroupDetails(group.id, ownerId);
  }

  getMyGroups(userId: string) {
    return this.prisma.group.findMany({
      where: { memberships: { some: { userId } } },
      include: {
        owner: { select: { id: true, username: true } },
        _count: { select: { memberships: true, appointments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getGroupDetails(groupId: string, userId: string) {
    await this.assertMember(groupId, userId);
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        owner: { select: { id: true, username: true } },
        memberships: {
          orderBy: { joinedAt: 'asc' },
          include: { user: { select: { id: true, username: true, email: true } } },
        },
        invitations: {
          where: { status: 'PENDING' },
          include: { invitedUser: { select: { id: true, username: true } } },
        },
      },
    });
    if (!group) {
      throw new NotFoundException('Group not found');
    }
    return group;
  }

  async deleteGroup(groupId: string, userId: string): Promise<void> {
    await this.assertOwner(groupId, userId);
    await this.prisma.group.delete({ where: { id: groupId } });
  }

  async leaveGroup(groupId: string, userId: string): Promise<void> {
    const membership = await this.assertMember(groupId, userId);
    if (membership.role === 'OWNER') {
      throw new BadRequestException(
        'The owner cannot leave the group; delete the group instead',
      );
    }
    await this.prisma.groupMembership.delete({ where: { id: membership.id } });
  }

  async invite(groupId: string, actorId: string, identifiers: string[]) {
    await this.assertOwner(groupId, actorId);
    const userIds = (await this.resolveUsers(identifiers)).filter((id) => id !== actorId);
    const memberships = await this.prisma.groupMembership.findMany({
      where: { groupId },
      select: { userId: true },
    });
    const memberIds = new Set(memberships.map((m) => m.userId));
    const targets = userIds.filter((id) => !memberIds.has(id));

    const invitations = [];
    for (const invitedUserId of targets) {
      const invitation = await this.prisma.groupInvitation.upsert({
        where: { groupId_invitedUserId: { groupId, invitedUserId } },
        create: { groupId, invitedUserId, invitedById: actorId, status: 'PENDING' },
        update: { status: 'PENDING', invitedById: actorId },
        include: { invitedUser: { select: { id: true, username: true } } },
      });
      invitations.push(invitation);
    }
    return invitations;
  }

  async removeMember(groupId: string, actorId: string, targetUserId: string): Promise<void> {
    await this.assertOwner(groupId, actorId);
    const membership = await this.getMembership(groupId, targetUserId);
    if (!membership) {
      throw new NotFoundException('User is not a member of this group');
    }
    if (membership.role === 'OWNER') {
      throw new BadRequestException('The owner cannot be removed');
    }
    await this.prisma.groupMembership.delete({ where: { id: membership.id } });
  }

  getMyInvitations(userId: string) {
    return this.prisma.groupInvitation.findMany({
      where: { invitedUserId: userId, status: 'PENDING' },
      include: {
        group: { select: { id: true, name: true } },
        invitedBy: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async acceptInvitation(invitationId: string, userId: string) {
    const invitation = await this.getPendingInvitationForUser(invitationId, userId);
    return this.prisma.$transaction(async (tx) => {
      await tx.groupInvitation.update({
        where: { id: invitationId },
        data: { status: 'ACCEPTED' },
      });
      await tx.groupMembership.upsert({
        where: { groupId_userId: { groupId: invitation.groupId, userId } },
        create: { groupId: invitation.groupId, userId, role: 'MEMBER' },
        update: {},
      });
      return tx.group.findUnique({ where: { id: invitation.groupId } });
    });
  }

  async declineInvitation(invitationId: string, userId: string) {
    await this.getPendingInvitationForUser(invitationId, userId);
    return this.prisma.groupInvitation.update({
      where: { id: invitationId },
      data: { status: 'DECLINED' },
    });
  }

  async revokeInvitation(invitationId: string, actorId: string): Promise<void> {
    const invitation = await this.prisma.groupInvitation.findUnique({
      where: { id: invitationId },
    });
    if (!invitation || invitation.status !== 'PENDING') {
      throw new NotFoundException('Invitation not found');
    }
    await this.assertOwner(invitation.groupId, actorId);
    await this.prisma.groupInvitation.delete({ where: { id: invitationId } });
  }

  getMembership(groupId: string, userId: string) {
    return this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
  }

  async assertMember(groupId: string, userId: string) {
    const membership = await this.getMembership(groupId, userId);
    if (!membership) {
      throw new ForbiddenException('You are not a member of this group');
    }
    return membership;
  }

  async assertOwner(groupId: string, userId: string) {
    const membership = await this.getMembership(groupId, userId);
    if (!membership || membership.role !== 'OWNER') {
      throw new ForbiddenException('Only the group owner can perform this action');
    }
    return membership;
  }

  private async getPendingInvitationForUser(invitationId: string, userId: string) {
    const invitation = await this.prisma.groupInvitation.findUnique({
      where: { id: invitationId },
    });
    if (!invitation || invitation.invitedUserId !== userId) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.status !== 'PENDING') {
      throw new BadRequestException('Invitation is no longer pending');
    }
    return invitation;
  }

  private async resolveUsers(identifiers: string[]): Promise<string[]> {
    const resolved: string[] = [];
    const notFound: string[] = [];
    for (const identifier of identifiers) {
      const user = await this.users.findByIdentifier(identifier);
      if (user) {
        resolved.push(user.id);
      } else {
        notFound.push(identifier);
      }
    }
    if (notFound.length > 0) {
      throw new NotFoundException(`Unknown users: ${notFound.join(', ')}`);
    }
    return [...new Set(resolved)];
  }
}
