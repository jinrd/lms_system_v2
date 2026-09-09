import { Controller, Get, Query } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../generated/prisma/enums';
import { StatisticsQueryDto } from './dto/statistics-query.dto';
import {
  type AttendanceStatisticsResponse,
  type EnrollmentStatisticsResponse,
  type ExamStatisticsResponse,
  type OperationsOverviewResponse,
  StatisticsService,
} from './statistics.service';

/**
 * 분석 및 운영 메뉴의 집계 API다(기획안 §13.4). 강사·실장·원장·관리자만 접근하며,
 * 강사는 담당 교육과정이 포함된 반으로 범위가 자동 축소된다. 학생 본인 통계는
 * 기존 `/attendance/my-summary`, `/me/exams/*`를 쓴다.
 */
@Controller('statistics')
@Roles(
  UserRole.INSTRUCTOR,
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
)
export class StatisticsController {
  constructor(private readonly service: StatisticsService) {}

  @Get('attendance')
  attendance(
    @Query() query: StatisticsQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AttendanceStatisticsResponse> {
    return this.service.attendance(actor, query);
  }

  @Get('exams')
  exams(
    @Query() query: StatisticsQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ExamStatisticsResponse> {
    return this.service.exams(actor, query);
  }

  @Get('enrollments')
  enrollments(
    @Query() query: StatisticsQueryDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<EnrollmentStatisticsResponse> {
    return this.service.enrollments(actor, query);
  }

  /** 운영 리포트·대시보드 요약. 실장·원장·관리자 전용(서비스에서 재확인). */
  @Get('overview')
  @Roles(UserRole.MANAGER, UserRole.PRINCIPAL, UserRole.ADMIN)
  overview(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<OperationsOverviewResponse> {
    return this.service.overview(actor);
  }
}
