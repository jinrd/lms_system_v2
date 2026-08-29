import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTermsDocumentDto } from './dto/create-terms-document.dto';
import { UpdateTermsDocumentDto } from './dto/update-terms-document.dto';

export type TermsDocumentResponse = {
  id: string;
  type: string;
  version: string;
  title: string;
  content: string;
  required: boolean;
  effectiveAt: string;
  active: boolean;
};

@Injectable()
export class TermsService {
  constructor(private readonly prisma: PrismaService) {}

  async findCurrentTerms(): Promise<TermsDocumentResponse[]> {
    const documents = await this.prisma.termsDocument.findMany({
      where: {
        active: true,
        effectiveAt: {
          lte: new Date(),
        },
      },
      orderBy: [{ required: 'desc' }, { type: 'asc' }],
    });

    return documents.map((document) => this.toResponse(document));
  }

  async findAllVersions(): Promise<TermsDocumentResponse[]> {
    const documents = await this.prisma.termsDocument.findMany({
      orderBy: [{ type: 'asc' }, { effectiveAt: 'desc' }, { version: 'desc' }],
    });

    return documents.map((document) => this.toResponse(document));
  }

  async createVersion(
    dto: CreateTermsDocumentDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<TermsDocumentResponse> {
    const type = dto.type.trim();
    const version = dto.version.trim();
    const title = dto.title.trim();
    const content = dto.content.trim();
    const effectiveAt = new Date(dto.effectiveAt);

    if (!type || !version || !title || !content) {
      throw new BadRequestException(
        '약관 유형, 버전, 제목과 내용이 필요합니다.',
      );
    }

    if (dto.activate && effectiveAt > new Date()) {
      throw new BadRequestException(
        '아직 시행되지 않은 약관은 바로 활성화할 수 없습니다.',
      );
    }

    try {
      const document = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(${type}))
      `;

        if (dto.activate) {
          await tx.termsDocument.updateMany({
            where: {
              type,
              active: true,
            },
            data: {
              active: false,
            },
          });
        }

        const created = await tx.termsDocument.create({
          data: {
            type,
            version,
            title,
            content,
            required: dto.required,
            effectiveAt,
            active: dto.activate,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            actorRole: actor.role,
            action: 'TERMS_DOCUMENT_CREATED',
            resourceType: 'TERMS_DOCUMENT',
            resourceId: created.id,
            afterData: {
              type: created.type,
              version: created.version,
              title: created.title,
              required: created.required,
              effectiveAt: created.effectiveAt.toISOString(),
              active: created.active,
            },
            ipAddress,
            result: 'SUCCESS',
          },
        });

        return created;
      });

      return this.toResponse(document);
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          '같은 유형과 버전의 약관이 이미 존재합니다.',
        );
      }

      throw error;
    }
  }

  async activateVersion(
    id: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<TermsDocumentResponse> {
    const document = await this.prisma.$transaction(async (tx) => {
      const target = await tx.termsDocument.findUnique({
        where: {
          id,
        },
      });

      if (!target) {
        throw new NotFoundException('약관 문서를 찾을 수 없습니다.');
      }

      if (target.effectiveAt > new Date()) {
        throw new BadRequestException(
          '시행 시각이 지나지 않은 약관은 활성화할 수 없습니다.',
        );
      }

      if (target.active) {
        return target;
      }

      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext(${target.type}))
      `;

      await tx.termsDocument.updateMany({
        where: {
          type: target.type,
          active: true,
        },
        data: {
          active: false,
        },
      });

      const activated = await tx.termsDocument.update({
        where: {
          id: target.id,
        },
        data: {
          active: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'TERMS_DOCUMENT_ACTIVATED',
          resourceType: 'TERMS_DOCUMENT',
          resourceId: activated.id,
          beforeData: {
            active: false,
          },
          afterData: {
            active: true,
            type: activated.type,
            version: activated.version,
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return activated;
    });

    return this.toResponse(document);
  }

  async updateVersion(
    id: string,
    dto: UpdateTermsDocumentDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<TermsDocumentResponse> {
    const type = dto.type;
    const version = dto.version.trim();
    const title = dto.title.trim();
    const content = dto.content.trim();
    const effectiveAt = new Date(dto.effectiveAt);

    if (!version || !title || !content) {
      throw new BadRequestException('버전, 제목과 내용이 필요합니다.');
    }

    try {
      const document = await this.prisma.$transaction(async (tx) => {
        const target = await tx.termsDocument.findUnique({ where: { id } });

        if (!target) {
          throw new NotFoundException('약관 문서를 찾을 수 없습니다.');
        }

        if (target.active && effectiveAt > new Date()) {
          throw new BadRequestException(
            '활성 약관의 시행 시각을 미래로 변경할 수 없습니다.',
          );
        }

        const lockTypes = Array.from(new Set([target.type, type])).sort();
        for (const lockType of lockTypes) {
          await tx.$executeRaw`
            SELECT pg_advisory_xact_lock(hashtext(${lockType}))
          `;
        }

        if (target.active && target.type !== type) {
          await tx.termsDocument.updateMany({
            where: { type, active: true },
            data: { active: false },
          });
        }

        const updated = await tx.termsDocument.update({
          where: { id },
          data: {
            type,
            version,
            title,
            content,
            required: dto.required,
            effectiveAt,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            actorRole: actor.role,
            action: 'TERMS_DOCUMENT_UPDATED',
            resourceType: 'TERMS_DOCUMENT',
            resourceId: updated.id,
            beforeData: {
              type: target.type,
              version: target.version,
              title: target.title,
              content: target.content,
              required: target.required,
              effectiveAt: target.effectiveAt.toISOString(),
              active: target.active,
            },
            afterData: {
              type: updated.type,
              version: updated.version,
              title: updated.title,
              content: updated.content,
              required: updated.required,
              effectiveAt: updated.effectiveAt.toISOString(),
              active: updated.active,
            },
            ipAddress,
            result: 'SUCCESS',
          },
        });

        return updated;
      });

      return this.toResponse(document);
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          '같은 유형과 버전의 약관이 이미 존재합니다.',
        );
      }

      throw error;
    }
  }

  private toResponse(document: {
    id: string;
    type: string;
    version: string;
    title: string;
    content: string;
    required: boolean;
    effectiveAt: Date;
    active: boolean;
  }): TermsDocumentResponse {
    return {
      id: document.id,
      type: document.type,
      version: document.version,
      title: document.title,
      content: document.content,
      required: document.required,
      effectiveAt: document.effectiveAt.toISOString(),
      active: document.active,
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    if (!('code' in error)) {
      return false;
    }

    return error.code === 'P2002';
  }
}
