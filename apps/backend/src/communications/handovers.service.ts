import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  buildPaginatedResult,
  type PaginatedResult,
  toSkipTake,
} from '../common/pagination';
import type { Prisma } from '../generated/prisma/client';
import { UserRole, UserStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CommunicationsAccessService } from './communications-access.service';
import { CreateHandoverDto } from './dto/create-handover.dto';
import { HandoverQueryDto } from './dto/handover-query.dto';
import { UpdateHandoverDto } from './dto/update-handover.dto';

export type HandoverResponse = {
  id: string;
  classId: string;
  className: string;
  fromInstructorId: string | null;
  fromInstructorName: string | null;
  toInstructorId: string;
  toInstructorName: string;
  title: string;
  content: string;
  createdById: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
};

const HANDOVER_INCLUDE = {
  class: { select: { name: true } },
  fromInstructor: { select: { id: true, name: true } },
  toInstructor: { select: { id: true, name: true } },
} as const;

type HandoverRow = Prisma.HandoverGetPayload<{
  include: typeof HANDOVER_INCLUDE;
}>;

/**
 * 강사 변경 시 반 인수인계 문서를 관리한다(기획안 §12·§20).
 *
 * 실장·원장·관리자가 강사 교체를 진행하며 문서를 만들고, 새 강사가 본인 화면에서
 * 확인 처리한다. 실제 담당 이력은 교육과정의 강사 배정에서 별도로 관리한다.
 */
@Injectable()
export class HandoversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CommunicationsAccessService,
  ) {}

  async create(
    dto: CreateHandoverDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<HandoverResponse> {
    if (dto.fromInstructorId && dto.fromInstructorId === dto.toInstructorId) {
      throw new BadRequestException('이전 강사와 새 강사가 같을 수 없습니다.');
    }

    const [klass, toInstructor, fromInstructor] = await Promise.all([
      this.prisma.class.findFirst({
        where: { id: dto.classId, archivedAt: null },
        select: { id: true },
      }),
      this.prisma.user.findFirst({
        where: {
          id: dto.toInstructorId,
          role: UserRole.INSTRUCTOR,
          status: UserStatus.ACTIVE,
        },
        select: { id: true },
      }),
      dto.fromInstructorId
        ? this.prisma.user.findFirst({
            where: { id: dto.fromInstructorId, role: UserRole.INSTRUCTOR },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    if (!klass) {
      throw new NotFoundException('대상 반을 찾을 수 없습니다.');
    }
    if (!toInstructor) {
      throw new BadRequestException(
        '새 강사는 재직 중인 강사 계정이어야 합니다.',
      );
    }
    if (dto.fromInstructorId && !fromInstructor) {
      throw new BadRequestException('이전 강사 계정을 찾을 수 없습니다.');
    }

    const id = await this.prisma.$transaction(async (tx) => {
      const created = await tx.handover.create({
        data: {
          classId: dto.classId,
          toInstructorId: dto.toInstructorId,
          fromInstructorId: dto.fromInstructorId ?? null,
          title: dto.title.trim(),
          content: dto.content.trim(),
          createdById: actor.id,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'HANDOVER_CREATED',
          resourceType: 'HANDOVER',
          resourceId: created.id,
          afterData: {
            classId: dto.classId,
            fromInstructorId: dto.fromInstructorId ?? null,
            toInstructorId: dto.toInstructorId,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return created.id;
    });

    return this.getById(id, actor);
  }

  async list(
    query: HandoverQueryDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedResult<HandoverResponse>> {
    const where: Prisma.HandoverWhereInput = {};
    if (query.classId) {
      where.classId = query.classId;
    }
    if (query.acknowledged !== undefined) {
      where.acknowledgedAt = query.acknowledged ? { not: null } : null;
    }

    if (!this.access.isPrivileged(actor.role)) {
      // 강사는 본인이 인계자이거나 인수자인 문서만 본다.
      where.OR = [{ fromInstructorId: actor.id }, { toInstructorId: actor.id }];
    }

    const { skip, take } = toSkipTake(query);
    const [rows, total] = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.handover.findMany({
        where,
        include: HANDOVER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      });
      const total = await tx.handover.count({ where });
      return [rows, total] as const;
    });

    return buildPaginatedResult(
      rows.map((row) => this.toResponse(row)),
      total,
      query,
    );
  }

  async getById(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<HandoverResponse> {
    const entity = await this.prisma.handover.findUnique({
      where: { id },
      include: HANDOVER_INCLUDE,
    });
    if (!entity || !this.canView(actor, entity)) {
      throw new NotFoundException('인수인계 문서를 찾을 수 없습니다.');
    }
    return this.toResponse(entity);
  }

  async update(
    id: string,
    dto: UpdateHandoverDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<HandoverResponse> {
    const entity = await this.prisma.handover.findUnique({
      where: { id },
      include: HANDOVER_INCLUDE,
    });
    if (!entity) {
      throw new NotFoundException('인수인계 문서를 찾을 수 없습니다.');
    }
    if (entity.acknowledgedAt) {
      throw new ConflictException(
        '새 강사가 확인한 뒤에는 수정할 수 없습니다.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.handover.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.content !== undefined ? { content: dto.content.trim() } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'HANDOVER_UPDATED',
          resourceType: 'HANDOVER',
          resourceId: id,
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.getById(id, actor);
  }

  /** 새 강사가 인수인계를 확인 처리한다. 본인만, 최초 1회만. */
  async acknowledge(
    id: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<HandoverResponse> {
    const entity = await this.prisma.handover.findUnique({
      where: { id },
      select: { id: true, toInstructorId: true, acknowledgedAt: true },
    });
    if (!entity) {
      throw new NotFoundException('인수인계 문서를 찾을 수 없습니다.');
    }
    if (entity.toInstructorId !== actor.id) {
      throw new ForbiddenException('새 강사 본인만 확인할 수 있습니다.');
    }
    if (entity.acknowledgedAt) {
      throw new ConflictException('이미 확인한 인수인계입니다.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.handover.update({
        where: { id },
        data: { acknowledgedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'HANDOVER_ACKNOWLEDGED',
          resourceType: 'HANDOVER',
          resourceId: id,
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return this.getById(id, actor);
  }

  private canView(actor: AuthenticatedUser, entity: HandoverRow): boolean {
    if (this.access.isPrivileged(actor.role)) {
      return true;
    }
    return (
      entity.fromInstructorId === actor.id || entity.toInstructorId === actor.id
    );
  }

  private toResponse(entity: HandoverRow): HandoverResponse {
    return {
      id: entity.id,
      classId: entity.classId,
      className: entity.class.name,
      fromInstructorId: entity.fromInstructorId,
      fromInstructorName: entity.fromInstructor?.name ?? null,
      toInstructorId: entity.toInstructorId,
      toInstructorName: entity.toInstructor.name,
      title: entity.title,
      content: entity.content,
      createdById: entity.createdById,
      createdAt: entity.createdAt.toISOString(),
      acknowledgedAt: entity.acknowledgedAt?.toISOString() ?? null,
    };
  }
}
