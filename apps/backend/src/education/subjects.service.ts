import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SubjectMode, UserRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeSubjectActiveDto } from './dto/change-subject-active.dto';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';

export type SubjectResponse = {
  id: string;
  educationFieldId: string;
  name: string;
  description: string | null;
  objective: string | null;
  mode: SubjectMode;
  defaultDurationMinutes: number | null;
  displayOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class SubjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEducationField(
    educationFieldId: string,
    actor: AuthenticatedUser,
  ): Promise<SubjectResponse[]> {
    const educationField = await this.prisma.educationField.findUnique({
      where: {
        id: educationFieldId,
      },
      select: {
        id: true,
        active: true,
      },
    });

    if (!educationField) {
      throw new NotFoundException('교육 분야를 찾을 수 없습니다.');
    }

    const canViewInactive =
      actor.role === UserRole.MANAGER ||
      actor.role === UserRole.PRINCIPAL ||
      actor.role === UserRole.ADMIN;

    if (!educationField.active && !canViewInactive) {
      throw new NotFoundException('교육 분야를 찾을 수 없습니다.');
    }

    const subjects = await this.prisma.subject.findMany({
      where: {
        educationFieldId,
        ...(canViewInactive ? {} : { active: true }),
      },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });

    return subjects.map((subject) => this.toResponse(subject));
  }

  async create(
    educationFieldId: string,
    dto: CreateSubjectDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<SubjectResponse> {
    const educationField = await this.prisma.educationField.findUnique({
      where: {
        id: educationFieldId,
      },
    });

    if (!educationField) {
      throw new NotFoundException('교육 분야를 찾을 수 없습니다.');
    }

    if (dto.active && !educationField.active) {
      throw new ConflictException(
        '비활성 교육 분야에는 활성 과목을 등록할 수 없습니다.',
      );
    }

    try {
      const subject = await this.prisma.$transaction(async (tx) => {
        const created = await tx.subject.create({
          data: {
            educationFieldId,
            name: dto.name.trim(),
            description: dto.description?.trim() || null,
            objective: dto.objective?.trim() || null,
            mode: dto.mode,
            defaultDurationMinutes: dto.defaultDurationMinutes,
            displayOrder: dto.displayOrder,
            active: dto.active,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            actorRole: actor.role,
            action: 'SUBJECT_CREATED',
            resourceType: 'SUBJECT',
            resourceId: created.id,
            afterData: {
              educationFieldId: created.educationFieldId,
              name: created.name,
              mode: created.mode,
              defaultDurationMinutes: created.defaultDurationMinutes,
              displayOrder: created.displayOrder,
              active: created.active,
            },
            ipAddress,
            result: 'SUCCESS',
          },
        });

        return created;
      });

      return this.toResponse(subject);
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          '해당 교육 분야에 같은 이름의 과목이 이미 존재합니다.',
        );
      }

      throw error;
    }
  }

  async update(
    educationFieldId: string,
    subjectId: string,
    dto: UpdateSubjectDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<SubjectResponse> {
    try {
      const subject = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
            SELECT id
            FROM subjects
            WHERE id = ${subjectId}::uuid
            FOR UPDATE
          `;

        const existing = await tx.subject.findFirst({
          where: {
            id: subjectId,
            educationFieldId,
          },
        });

        if (!existing) {
          throw new NotFoundException('세부 과목을 찾을 수 없습니다.');
        }

        const updated = await tx.subject.update({
          where: {
            id: existing.id,
          },
          data: {
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(dto.description !== undefined
              ? {
                  description: dto.description.trim() || null,
                }
              : {}),
            ...(dto.objective !== undefined
              ? {
                  objective: dto.objective.trim() || null,
                }
              : {}),
            ...(dto.mode !== undefined ? { mode: dto.mode } : {}),
            ...(dto.defaultDurationMinutes !== undefined
              ? {
                  defaultDurationMinutes: dto.defaultDurationMinutes,
                }
              : {}),
            ...(dto.displayOrder !== undefined
              ? { displayOrder: dto.displayOrder }
              : {}),
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            actorRole: actor.role,
            action: 'SUBJECT_UPDATED',
            resourceType: 'SUBJECT',
            resourceId: updated.id,
            beforeData: {
              name: existing.name,
              description: existing.description,
              objective: existing.objective,
              mode: existing.mode,
              defaultDurationMinutes: existing.defaultDurationMinutes,
              displayOrder: existing.displayOrder,
            },
            afterData: {
              name: updated.name,
              description: updated.description,
              objective: updated.objective,
              mode: updated.mode,
              defaultDurationMinutes: updated.defaultDurationMinutes,
              displayOrder: updated.displayOrder,
            },
            ipAddress,
            result: 'SUCCESS',
          },
        });

        return updated;
      });

      return this.toResponse(subject);
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          '해당 교육 분야에 같은 이름의 과목이 이미 존재합니다.',
        );
      }

      throw error;
    }
  }

  async changeActive(
    educationFieldId: string,
    subjectId: string,
    dto: ChangeSubjectActiveDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<SubjectResponse> {
    const subject = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
          SELECT id
          FROM subjects
          WHERE id = ${subjectId}::uuid
          FOR UPDATE
        `;

      const existing = await tx.subject.findFirst({
        where: {
          id: subjectId,
          educationFieldId,
        },
        include: {
          educationField: true,
        },
      });

      if (!existing) {
        throw new NotFoundException('세부 과목을 찾을 수 없습니다.');
      }

      if (dto.active && !existing.educationField.active) {
        throw new ConflictException(
          '비활성 교육 분야의 과목은 활성화할 수 없습니다.',
        );
      }

      if (existing.active === dto.active) {
        return existing;
      }

      const updated = await tx.subject.update({
        where: {
          id: existing.id,
        },
        data: {
          active: dto.active,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: dto.active ? 'SUBJECT_ACTIVATED' : 'SUBJECT_DEACTIVATED',
          resourceType: 'SUBJECT',
          resourceId: updated.id,
          beforeData: {
            active: existing.active,
          },
          afterData: {
            active: updated.active,
          },
          reason: dto.reason.trim(),
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return updated;
    });

    return this.toResponse(subject);
  }

  private toResponse(subject: {
    id: string;
    educationFieldId: string;
    name: string;
    description: string | null;
    objective: string | null;
    mode: SubjectMode;
    defaultDurationMinutes: number | null;
    displayOrder: number;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): SubjectResponse {
    return {
      ...subject,
      createdAt: subject.createdAt.toISOString(),
      updatedAt: subject.updatedAt.toISOString(),
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
      return false;
    }

    return error.code === 'P2002';
  }
}
