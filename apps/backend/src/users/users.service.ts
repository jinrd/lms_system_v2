import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';

import type { AuthenticatedUser } from '../auth/auth.types';
import {
  EnrollmentStatus,
  Gender,
  UserRole,
  UserStatus,
} from '../generated/prisma/enums';
import { todaySeoulDateOnly } from '../common/seoul-date';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { PendingUsersQueryDto } from './dto/pending-users-query.dto';
import { randomBytes } from 'crypto';
import { ApproveSignupDto } from './dto/approve-signup.dto';
import {
  IssueTemporaryPasswordDto,
  IssueTemporaryPasswordResponse,
} from './dto/issue-temporary-password.dto';
import { UpdateStudentProfileDto } from './dto/update-student-profile.dto';
import { UserSearchQueryDto } from './dto/user-search-query.dto';

export type StudentProfileResponse = {
  id: string;
  loginId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  gender: Gender | null;
  isMinorAtSignup: boolean;
  guardianName: string | null;
  guardianPhone: string | null;
  updatedAt: string;
};

export type PendingSignupResponse = {
  id: string;
  loginId: string;
  email: string | null;
  name: string;
  phone: string;
  birthDate: string;
  gender: string;
  isMinorAtSignup: boolean;
  guardianName: string | null;
  guardianPhone: string | null;
  createdAt: string;
};

export type PendingSignupsPageResponse = {
  items: PendingSignupResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type UserStatusChangeResponse = {
  id: string;
  previousStatus: UserStatus;
  status: UserStatus;
  changedAt: string;
};

export type SignupApprovalResponse = UserStatusChangeResponse & {
  role: UserRole;
};

export type UserSummaryResponse = {
  id: string;
  loginId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  role: UserRole;
  status: UserStatus;
  mustChangePassword: boolean;
  createdAt: string;
};

export type UsersPageResponse = {
  items: UserSummaryResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** 하루를 밀리초로. 보관 기한 계산에 쓴다. */
  private static readonly DAY_MS = 24 * 60 * 60 * 1000;

  /**
   * 가입 대기(PENDING_APPROVAL) 신청자를 돌려준다. 가입은 모두 공개 회원가입으로
   * 들어오므로 신청 시점 역할은 항상 STUDENT이고, 승인자가 역할을 정한다
   * (기획안 §6.1 / D-18).
   */
  async findPendingSignups(
    query: PendingUsersQueryDto,
  ): Promise<PendingSignupsPageResponse> {
    const skip = (query.page - 1) * query.limit;

    const [users, total] = await this.prisma.$transaction(async (tx) => {
      const users = await tx.user.findMany({
        where: {
          status: UserStatus.PENDING_APPROVAL,
        },
        include: {
          studentProfile: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
        skip,
        take: query.limit,
      });
      const total = await tx.user.count({
        where: {
          status: UserStatus.PENDING_APPROVAL,
        },
      });
      return [users, total] as const;
    });

    const items = users.map((user) => {
      if (
        !user.loginId ||
        !user.phone ||
        !user.birthDate ||
        !user.gender ||
        !user.studentProfile
      ) {
        throw new Error(`가입 신청자 데이터가 불완전합니다: ${user.id}`);
      }

      return {
        id: user.id,
        loginId: user.loginId,
        email: user.email,
        name: user.name,
        phone: user.phone,
        birthDate: user.birthDate.toISOString().slice(0, 10),
        gender: user.gender,
        isMinorAtSignup: user.studentProfile.isMinorAtSignup,
        guardianName: user.studentProfile.guardianName,
        guardianPhone: user.studentProfile.guardianPhone,
        createdAt: user.createdAt.toISOString(),
      };
    });

    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  /**
   * 가입 신청을 승인하면서 역할을 부여한다(기획안 §6.1 / D-18). 승인자별 부여
   * 가능 역할은 관리자 → 학생·강사·실장·원장·관리자, 실장·원장 → 학생·강사다.
   * 학생이 아닌 역할로 승인하면 회원가입 때 만들어진 학생 프로필과 생년월일·성별을
   * 지운다.
   */
  async approveSignup(
    userId: string,
    dto: ApproveSignupDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<SignupApprovalResponse> {
    const changedAt = new Date();
    const grantedRole = dto.role;
    this.assertCanGrantRole(actor.role, grantedRole);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM users
        WHERE id = ${userId}::uuid
        FOR UPDATE
      `;

      const user = await tx.user.findUnique({
        where: {
          id: userId,
        },
      });

      if (!user) {
        throw new NotFoundException('가입 신청자를 찾을 수 없습니다.');
      }

      if (user.status !== UserStatus.PENDING_APPROVAL) {
        throw new ConflictException(
          '가입 대기 상태의 신청자만 승인할 수 있습니다.',
        );
      }

      const previousStatus = user.status;
      const previousRole = user.role;
      const isStudent = grantedRole === UserRole.STUDENT;

      await tx.user.update({
        where: {
          id: user.id,
        },
        data: {
          status: UserStatus.ACTIVE,
          role: grantedRole,
          approvedById: actor.id,
          approvedAt: changedAt,
          rejectedAt: null,
          rejectionReason: null,
          scheduledDeletionAt: null,
          ...(isStudent ? {} : { birthDate: null, gender: null }),
        },
      });

      if (!isStudent) {
        // 회원가입 폼은 학생 형태라 항상 학생 프로필이 생성된다. 학생이 아닌
        // 역할로 승인하면 필요 없는 개인정보를 남기지 않는다.
        await tx.studentProfile.deleteMany({ where: { userId: user.id } });
      }

      await tx.userStatusHistory.create({
        data: {
          userId: user.id,
          previousStatus,
          newStatus: UserStatus.ACTIVE,
          reason: `회원가입 승인 (${grantedRole})`,
          changedById: actor.id,
          changedAt,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'SIGNUP_APPROVED',
          resourceType: 'USER',
          resourceId: user.id,
          beforeData: {
            status: previousStatus,
            role: previousRole,
          },
          afterData: {
            status: UserStatus.ACTIVE,
            role: grantedRole,
            approvedAt: changedAt.toISOString(),
          },
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return {
        id: user.id,
        previousStatus,
        status: UserStatus.ACTIVE,
        role: grantedRole,
        changedAt: changedAt.toISOString(),
      };
    });
  }

  async rejectSignup(
    userId: string,
    reason: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<UserStatusChangeResponse> {
    const changedAt = new Date();
    // 보관 기한은 운영 중 조정 가능한 정책값이다(기획안 §22).
    const rejectedRetentionDays = await this.settings.getNumber(
      'student.rejected_signup_retention_days',
    );
    const scheduledDeletionAt = new Date(
      changedAt.getTime() + rejectedRetentionDays * UsersService.DAY_MS,
    );
    const normalizedReason = reason.trim();

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id
        FROM users
        WHERE id = ${userId}::uuid
        FOR UPDATE
      `;

      const user = await tx.user.findUnique({
        where: {
          id: userId,
        },
      });

      if (!user) {
        throw new NotFoundException('가입 신청자를 찾을 수 없습니다.');
      }

      if (user.status !== UserStatus.PENDING_APPROVAL) {
        throw new ConflictException(
          '가입 대기 상태의 신청자만 거절할 수 있습니다.',
        );
      }

      const previousStatus = user.status;

      await tx.user.update({
        where: {
          id: user.id,
        },
        data: {
          status: UserStatus.REJECTED,
          rejectedAt: changedAt,
          rejectionReason: normalizedReason,
          scheduledDeletionAt,
          approvedById: null,
          approvedAt: null,
          tokenVersion: {
            increment: 1,
          },
        },
      });

      await tx.authSession.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
        },
        data: {
          revokedAt: changedAt,
          revokeReason: 'ACCOUNT_REJECTED',
        },
      });

      await tx.userStatusHistory.create({
        data: {
          userId: user.id,
          previousStatus,
          newStatus: UserStatus.REJECTED,
          reason: normalizedReason,
          changedById: actor.id,
          changedAt,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'SIGNUP_REJECTED',
          resourceType: 'USER',
          resourceId: user.id,
          beforeData: {
            status: previousStatus,
          },
          afterData: {
            status: UserStatus.REJECTED,
            rejectionReason: normalizedReason,
            scheduledDeletionAt: scheduledDeletionAt.toISOString(),
          },
          reason: normalizedReason,
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return {
        id: user.id,
        previousStatus,
        status: UserStatus.REJECTED,
        changedAt: changedAt.toISOString(),
      };
    });
  }

  async issueTemporaryPassword(
    userId: string,
    dto: IssueTemporaryPasswordDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<IssueTemporaryPasswordResponse> {
    if (userId === actor.id) {
      throw new BadRequestException(
        '자기 자신의 비밀번호는 비밀번호 변경 기능을 이용하세요.',
      );
    }

    const target = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!target || target.status === UserStatus.DELETED) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    if (target.status !== UserStatus.ACTIVE) {
      throw new ConflictException(
        '활성 상태의 사용자만 임시 비밀번호를 발급할 수 있습니다.',
      );
    }

    await this.assertCanIssueTemporaryPassword(actor, target.id, target.role);

    const temporaryPassword = this.createTemporaryPassword();
    const passwordHash = await argon2.hash(temporaryPassword, {
      type: argon2.argon2id,
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const reason = dto.reason.trim();

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
      SELECT id
      FROM users
      WHERE id = ${target.id}::uuid
      FOR UPDATE
    `;

      const lockedUser = await tx.user.findUnique({
        where: {
          id: target.id,
        },
      });

      if (!lockedUser || lockedUser.status !== UserStatus.ACTIVE) {
        throw new ConflictException(
          '사용자 상태가 변경되었습니다. 다시 확인해 주세요.',
        );
      }

      await tx.user.update({
        where: {
          id: lockedUser.id,
        },
        data: {
          passwordHash,
          mustChangePassword: true,
          temporaryPasswordExpiresAt: expiresAt,
          passwordChangedAt: now,
          tokenVersion: {
            increment: 1,
          },
        },
      });

      await tx.authSession.updateMany({
        where: {
          userId: lockedUser.id,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
          revokeReason: 'TEMPORARY_PASSWORD_ISSUED',
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'TEMPORARY_PASSWORD_ISSUED',
          resourceType: 'USER',
          resourceId: lockedUser.id,
          beforeData: {
            tokenVersion: lockedUser.tokenVersion,
            mustChangePassword: lockedUser.mustChangePassword,
          },
          afterData: {
            tokenVersion: lockedUser.tokenVersion + 1,
            mustChangePassword: true,
            temporaryPasswordExpiresAt: expiresAt.toISOString(),
            sessionsRevoked: true,
          },
          reason,
          ipAddress,
          result: 'SUCCESS',
        },
      });
    });

    return {
      userId: target.id,
      temporaryPassword,
      temporaryPasswordExpiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * 학생 개인정보를 수정한다(기획안 §3 / §6.2). 학생 본인은 호출할 수 없고,
   * 담당 강사(담당 교육과정에 이 학생이 현재 수강 중일 때)와 실장·원장·관리자만
   * 가능하다. 보낸 필드만 바꾸고 변경 전후 값과 작업자를 감사 로그에 남긴다.
   * 미성년으로 가입한 학생의 보호자 정보는 이 API로 비울 수 없다.
   */
  async updateStudentProfile(
    userId: string,
    dto: UpdateStudentProfileDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<StudentProfileResponse> {
    const reason = dto.reason.trim();
    if (reason.length === 0) {
      throw new BadRequestException('변경 사유가 필요합니다.');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { studentProfile: true },
    });
    if (
      !target ||
      target.role !== UserRole.STUDENT ||
      target.status === UserStatus.DELETED
    ) {
      throw new NotFoundException('학생 계정을 찾을 수 없습니다.');
    }
    if (target.status !== UserStatus.ACTIVE) {
      throw new ConflictException(
        '활성 상태의 학생만 개인정보를 수정할 수 있습니다.',
      );
    }

    await this.assertCanEditStudentProfile(actor, target.id);

    const email =
      dto.email === undefined
        ? undefined
        : dto.email.trim().length === 0
          ? null
          : dto.email.trim().toLowerCase();

    const userData: {
      name?: string;
      phone?: string;
      email?: string | null;
      birthDate?: Date;
      gender?: Gender;
    } = {};
    if (dto.name !== undefined) userData.name = dto.name.trim();
    if (dto.phone !== undefined)
      userData.phone = dto.phone.replace(/[^0-9]/g, '');
    if (email !== undefined) userData.email = email;
    if (dto.birthDate !== undefined)
      userData.birthDate = new Date(dto.birthDate);
    if (dto.gender !== undefined) userData.gender = dto.gender;

    const profileData: { guardianName?: string; guardianPhone?: string } = {};
    if (dto.guardianName !== undefined)
      profileData.guardianName = dto.guardianName.trim();
    if (dto.guardianPhone !== undefined)
      profileData.guardianPhone = dto.guardianPhone.replace(/[^0-9]/g, '');

    const updated = await this.prisma.$transaction(async (tx) => {
      if (Object.keys(userData).length > 0) {
        await tx.user.update({ where: { id: target.id }, data: userData });
      }
      if (Object.keys(profileData).length > 0) {
        await tx.studentProfile.update({
          where: { userId: target.id },
          data: profileData,
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'STUDENT_PROFILE_UPDATED',
          resourceType: 'USER',
          resourceId: target.id,
          beforeData: {
            name: target.name,
            phone: target.phone,
            email: target.email,
            birthDate: target.birthDate?.toISOString().slice(0, 10) ?? null,
            gender: target.gender,
            guardianName: target.studentProfile?.guardianName ?? null,
            guardianPhone: target.studentProfile?.guardianPhone ?? null,
          },
          afterData: {
            ...userData,
            ...(userData.birthDate
              ? { birthDate: userData.birthDate.toISOString().slice(0, 10) }
              : {}),
            ...profileData,
          },
          reason,
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return tx.user.findUniqueOrThrow({
        where: { id: target.id },
        include: { studentProfile: true },
      });
    });

    return {
      id: updated.id,
      loginId: updated.loginId,
      name: updated.name,
      phone: updated.phone,
      email: updated.email,
      birthDate: updated.birthDate?.toISOString().slice(0, 10) ?? null,
      gender: updated.gender,
      isMinorAtSignup: updated.studentProfile?.isMinorAtSignup ?? false,
      guardianName: updated.studentProfile?.guardianName ?? null,
      guardianPhone: updated.studentProfile?.guardianPhone ?? null,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * 학생 개인정보 수정 권한을 확인한다. 실장·원장·관리자는 전체, 강사는 담당
   * 교육과정에 이 학생이 현재 수강 중일 때만 허용한다(2026-09-01 개편).
   */
  private async assertCanEditStudentProfile(
    actor: AuthenticatedUser,
    studentId: string,
  ): Promise<void> {
    if (
      actor.role === UserRole.ADMIN ||
      actor.role === UserRole.MANAGER ||
      actor.role === UserRole.PRINCIPAL
    ) {
      return;
    }
    if (actor.role !== UserRole.INSTRUCTOR) {
      throw new ForbiddenException('학생 개인정보를 수정할 권한이 없습니다.');
    }

    const today = todaySeoulDateOnly();
    const assigned = await this.prisma.enrollment.findFirst({
      where: {
        studentId,
        status: EnrollmentStatus.ACTIVE,
        startsOn: { lte: today },
        OR: [{ endsOn: null }, { endsOn: { gte: today } }],
        courseOffering: { instructorId: actor.id, archivedAt: null },
      },
      select: { id: true },
    });
    if (!assigned) {
      throw new ForbiddenException(
        '현재 담당 학생의 개인정보만 수정할 수 있습니다.',
      );
    }
  }

  async findUsers(query: UserSearchQueryDto): Promise<UsersPageResponse> {
    const keyword = query.keyword?.trim();
    const skip = (query.page - 1) * query.limit;

    const where = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(keyword
        ? {
            OR: [
              {
                loginId: {
                  contains: keyword,
                  mode: 'insensitive' as const,
                },
              },
              {
                name: {
                  contains: keyword,
                  mode: 'insensitive' as const,
                },
              },
              {
                phone: {
                  contains: keyword,
                },
              },
            ],
          }
        : {}),
    };

    const [users, total] = await this.prisma.$transaction(async (tx) => {
      const users = await tx.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: query.limit,
        select: {
          id: true,
          loginId: true,
          name: true,
          phone: true,
          email: true,
          role: true,
          status: true,
          mustChangePassword: true,
          createdAt: true,
        },
      });
      const total = await tx.user.count({ where });
      return [users, total] as const;
    });

    return {
      items: users.map((user) => ({
        ...user,
        createdAt: user.createdAt.toISOString(),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async deactivateUser(
    userId: string,
    reason: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<UserStatusChangeResponse> {
    if (userId === actor.id) {
      throw new BadRequestException(
        '자기 자신의 계정은 비활성화할 수 없습니다.',
      );
    }

    const changedAt = new Date();
    const normalizedReason = reason.trim();
    // 비활성 후 개인정보 익명화까지의 유예 일수는 운영 중 조정 가능하다(기획안 §22).
    const inactiveRetentionDays = await this.settings.getNumber(
      'student.inactive_retention_days',
    );

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
      SELECT id
      FROM users
      WHERE id = ${userId}::uuid
      FOR UPDATE
    `;

      const user = await tx.user.findUnique({
        where: {
          id: userId,
        },
      });

      if (!user || user.status === UserStatus.DELETED) {
        throw new NotFoundException('사용자를 찾을 수 없습니다.');
      }

      this.assertCanManageUser(actor.role, user.role);

      if (user.status !== UserStatus.ACTIVE) {
        throw new ConflictException(
          '활성 상태의 사용자만 비활성화할 수 있습니다.',
        );
      }

      if (user.role === UserRole.INSTRUCTOR) {
        // 담당 강사는 교육과정에 속한다. 아직 운영이 끝나지 않은 반이 이 강사의
        // 교육과정을 포함하고 있으면, 담당 강사를 넘긴 뒤에만 비활성화할 수 있다.
        const today = todaySeoulDateOnly();

        const activeClassCount = await tx.class.count({
          where: {
            archivedAt: null,
            endDate: {
              gte: today,
            },
            programs: {
              some: {
                courseOffering: {
                  instructorId: user.id,
                  archivedAt: null,
                },
              },
            },
          },
        });

        if (activeClassCount > 0) {
          throw new ConflictException(
            '담당 교육과정을 다른 강사로 변경하거나 해당 반 운영이 끝난 뒤 비활성화할 수 있습니다.',
          );
        }
      }

      const scheduledDeletionAt =
        user.role === UserRole.STUDENT
          ? new Date(
              changedAt.getTime() + inactiveRetentionDays * UsersService.DAY_MS,
            )
          : null;

      await tx.user.update({
        where: {
          id: user.id,
        },
        data: {
          status: UserStatus.INACTIVE,
          deactivatedAt: changedAt,
          scheduledDeletionAt,
          tokenVersion: {
            increment: 1,
          },
        },
      });

      if (user.role === UserRole.STUDENT) {
        await tx.studentProfile.updateMany({
          where: {
            userId: user.id,
          },
          data: {
            guardianName: null,
            guardianPhone: null,
            guardianRemovedAt: changedAt,
          },
        });
      }

      await tx.authSession.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
        },
        data: {
          revokedAt: changedAt,
          revokeReason: 'ACCOUNT_DEACTIVATED',
        },
      });

      await tx.userStatusHistory.create({
        data: {
          userId: user.id,
          previousStatus: UserStatus.ACTIVE,
          newStatus: UserStatus.INACTIVE,
          reason: normalizedReason,
          changedById: actor.id,
          changedAt,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'USER_DEACTIVATED',
          resourceType: 'USER',
          resourceId: user.id,
          beforeData: {
            status: UserStatus.ACTIVE,
            tokenVersion: user.tokenVersion,
          },
          afterData: {
            status: UserStatus.INACTIVE,
            tokenVersion: user.tokenVersion + 1,
            deactivatedAt: changedAt.toISOString(),
            scheduledDeletionAt: scheduledDeletionAt?.toISOString() ?? null,
            sessionsRevoked: true,
          },
          reason: normalizedReason,
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return {
        id: user.id,
        previousStatus: UserStatus.ACTIVE,
        status: UserStatus.INACTIVE,
        changedAt: changedAt.toISOString(),
      };
    });
  }

  async reactivateUser(
    userId: string,
    reason: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<UserStatusChangeResponse> {
    const changedAt = new Date();
    const normalizedReason = reason.trim();

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
      SELECT id
      FROM users
      WHERE id = ${userId}::uuid
      FOR UPDATE
    `;

      const user = await tx.user.findUnique({
        where: {
          id: userId,
        },
      });

      if (!user || user.status === UserStatus.DELETED) {
        throw new NotFoundException('사용자를 찾을 수 없습니다.');
      }

      this.assertCanManageUser(actor.role, user.role);

      if (user.status !== UserStatus.INACTIVE) {
        throw new ConflictException(
          '비활성 상태의 사용자만 재활성화할 수 있습니다.',
        );
      }

      if (!user.loginId || !user.passwordHash || !user.phone) {
        throw new ConflictException(
          '로그인 정보가 제거된 계정은 재활성화할 수 없습니다.',
        );
      }

      await tx.user.update({
        where: {
          id: user.id,
        },
        data: {
          status: UserStatus.ACTIVE,
          deactivatedAt: null,
          scheduledDeletionAt: null,
          tokenVersion: {
            increment: 1,
          },
        },
      });

      await tx.userStatusHistory.create({
        data: {
          userId: user.id,
          previousStatus: UserStatus.INACTIVE,
          newStatus: UserStatus.ACTIVE,
          reason: normalizedReason,
          changedById: actor.id,
          changedAt,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          actorRole: actor.role,
          action: 'USER_REACTIVATED',
          resourceType: 'USER',
          resourceId: user.id,
          beforeData: {
            status: UserStatus.INACTIVE,
          },
          afterData: {
            status: UserStatus.ACTIVE,
            tokenVersion: user.tokenVersion + 1,
            deactivatedAt: null,
            scheduledDeletionAt: null,
          },
          reason: normalizedReason,
          ipAddress,
          result: 'SUCCESS',
        },
      });

      return {
        id: user.id,
        previousStatus: UserStatus.INACTIVE,
        status: UserStatus.ACTIVE,
        changedAt: changedAt.toISOString(),
      };
    });
  }

  private async assertCanIssueTemporaryPassword(
    actor: AuthenticatedUser,
    targetUserId: string,
    targetRole: UserRole,
  ): Promise<void> {
    if (actor.role === UserRole.ADMIN) {
      return;
    }

    if (actor.role === UserRole.MANAGER || actor.role === UserRole.PRINCIPAL) {
      if (
        targetRole === UserRole.STUDENT ||
        targetRole === UserRole.INSTRUCTOR
      ) {
        return;
      }

      throw new ForbiddenException(
        '해당 사용자에게 임시 비밀번호를 발급할 권한이 없습니다.',
      );
    }

    if (actor.role !== UserRole.INSTRUCTOR || targetRole !== UserRole.STUDENT) {
      throw new ForbiddenException(
        '해당 사용자에게 임시 비밀번호를 발급할 권한이 없습니다.',
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 담당 강사는 반이 아니라 교육과정에 배정된다(기획안 2026-09-01 개편,
    // Part III D-03·D-19·D-21). class_instructor_assignments 는 이력 보존용
    // 레거시라 쓰지 않고, 강사가 담당하는 보관되지 않은 교육과정에 이 학생이
    // 현재 수강 중인지로 판정한다.
    const assignedStudent = await this.prisma.enrollment.findFirst({
      where: {
        studentId: targetUserId,
        status: EnrollmentStatus.ACTIVE,
        startsOn: {
          lte: today,
        },
        OR: [
          {
            endsOn: null,
          },
          {
            endsOn: {
              gte: today,
            },
          },
        ],
        courseOffering: {
          instructorId: actor.id,
          archivedAt: null,
        },
      },
      select: {
        id: true,
      },
    });

    if (!assignedStudent) {
      throw new ForbiddenException(
        '현재 담당 학생의 임시 비밀번호만 발급할 수 있습니다.',
      );
    }
  }

  /**
   * 가입 승인 시 부여할 수 있는 역할을 승인자 역할로 제한한다(기획안 §6.1 / D-18).
   * 관리자는 모든 역할을, 실장·원장은 학생·강사만 부여할 수 있다.
   */
  private assertCanGrantRole(actorRole: UserRole, targetRole: UserRole): void {
    const grantable: Partial<Record<UserRole, UserRole[]>> = {
      [UserRole.ADMIN]: [
        UserRole.STUDENT,
        UserRole.INSTRUCTOR,
        UserRole.MANAGER,
        UserRole.PRINCIPAL,
        UserRole.ADMIN,
      ],
      [UserRole.MANAGER]: [UserRole.STUDENT, UserRole.INSTRUCTOR],
      [UserRole.PRINCIPAL]: [UserRole.STUDENT, UserRole.INSTRUCTOR],
    };

    if (!(grantable[actorRole] ?? []).includes(targetRole)) {
      throw new ForbiddenException('해당 역할을 부여할 권한이 없습니다.');
    }
  }

  private createTemporaryPassword(): string {
    return randomBytes(18).toString('base64url');
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

  private assertCanManageUser(actorRole: UserRole, targetRole: UserRole): void {
    if (actorRole === UserRole.ADMIN) {
      return;
    }

    if (actorRole === UserRole.MANAGER || actorRole === UserRole.PRINCIPAL) {
      if (
        targetRole === UserRole.STUDENT ||
        targetRole === UserRole.INSTRUCTOR
      ) {
        return;
      }
    }

    throw new ForbiddenException(
      '해당 사용자의 상태를 변경할 권한이 없습니다.',
    );
  }
}
