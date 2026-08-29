import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserRole } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeEducationFieldActiveDto } from './dto/change-education-field-active.dto';
import { CreateEducationFieldDto } from './dto/create-education-field.dto';
import { UpdateEducationFieldDto } from './dto/update-education-field.dto';

export type EducationFieldResponse = {
  id: string;
  name: string;
  description: string | null;
  displayOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class EducationFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(actor: AuthenticatedUser): Promise<EducationFieldResponse[]> {
    const canViewInactive =
      actor.role === UserRole.MANAGER ||
      actor.role === UserRole.PRINCIPAL ||
      actor.role === UserRole.ADMIN;

    const fields = await this.prisma.educationField.findMany({
      where: canViewInactive
        ? undefined
        : {
            active: true,
          },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });

    return fields.map((field) => this.toResponse(field));
  }

  async create(
    dto: CreateEducationFieldDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<EducationFieldResponse> {
    const name = dto.name.trim();
    const description = dto.description?.trim() || null;

    try {
      const field = await this.prisma.$transaction(async (tx) => {
        const created = await tx.educationField.create({
          data: {
            name,
            description,
            displayOrder: dto.displayOrder,
            active: dto.active,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            actorRole: actor.role,
            action: 'EDUCATION_FIELD_CREATED',
            resourceType: 'EDUCATION_FIELD',
            resourceId: created.id,
            afterData: {
              name: created.name,
              description: created.description,
              displayOrder: created.displayOrder,
              active: created.active,
            },
            ipAddress,
            result: 'SUCCESS',
          },
        });

        return created;
      });

      return this.toResponse(field);
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('같은 이름의 교육 분야가 이미 존재합니다.');
      }

      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateEducationFieldDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<EducationFieldResponse> {
    try {
      const field = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT id
          FROM education_fields
          WHERE id = ${id}::uuid
          FOR UPDATE
        `;

        const existing = await tx.educationField.findUnique({
          where: { id },
        });

        if (!existing) {
          throw new NotFoundException('교육 분야를 찾을 수 없습니다.');
        }

        const updated = await tx.educationField.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(dto.description !== undefined
              ? {
                  description: dto.description.trim() || null,
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
            action: 'EDUCATION_FIELD_UPDATED',
            resourceType: 'EDUCATION_FIELD',
            resourceId: updated.id,
            beforeData: {
              name: existing.name,
              description: existing.description,
              displayOrder: existing.displayOrder,
            },
            afterData: {
              name: updated.name,
              description: updated.description,
              displayOrder: updated.displayOrder,
            },
            ipAddress,
            result: 'SUCCESS',
          },
        });

        return updated;
      });

      return this.toResponse(field);
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('같은 이름의 교육 분야가 이미 존재합니다.');
      }

      throw error;
    }
  }

  async changeActive(
    id: string,
    dto: ChangeEducationFieldActiveDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<EducationFieldResponse> {
    const field = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM education_fields
        WHERE id = ${id}::uuid
        FOR UPDATE
      `;

      const existing = await tx.educationField.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new NotFoundException('교육 분야를 찾을 수 없습니다.');
      }

      if (existing.active === dto.active) {
        return existing;
      }

      const updated = await tx.educationField.update({
        where: { id },
        data: {
          active: dto.active,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: dto.active
            ? 'EDUCATION_FIELD_ACTIVATED'
            : 'EDUCATION_FIELD_DEACTIVATED',
          resourceType: 'EDUCATION_FIELD',
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

    return this.toResponse(field);
  }

  private toResponse(field: {
    id: string;
    name: string;
    description: string | null;
    displayOrder: number;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): EducationFieldResponse {
    return {
      ...field,
      createdAt: field.createdAt.toISOString(),
      updatedAt: field.updatedAt.toISOString(),
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
      return false;
    }

    return error.code === 'P2002';
  }
}
