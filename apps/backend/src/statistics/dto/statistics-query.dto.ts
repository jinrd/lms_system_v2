import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { ExamStage } from '../../generated/prisma/enums';

/**
 * 통계 조회 공통 필터다(기획안 §13.4). 페이지네이션은 두지 않는다 — 반·시험
 * 개수가 단일 학원 규모에서 작아 집계 결과를 한 번에 돌려준다.
 *
 * 범위는 역할이 정한다: 강사는 담당 교육과정이 포함된 반으로 자동 축소되고,
 * 실장·원장·관리자는 전체다. 아래 필터는 그 범위를 더 좁힐 때만 쓴다.
 */
export class StatisticsQueryDto {
  @IsOptional()
  @IsUUID()
  courseOfferingId?: string;

  @IsOptional()
  @IsUUID()
  classId?: string;

  /** 출석 통계에서 특정 세부 과목의 수업만 집계할 때. */
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  /** 시험 통계에서 시험 단계로 좁힐 때. */
  @IsOptional()
  @IsEnum(ExamStage)
  stage?: ExamStage;

  /** 집계 기간 시작(포함). 출석은 수업 날짜(KST), 시험은 응시 시작 시각 기준. */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** 집계 기간 끝(포함). */
  @IsOptional()
  @IsISO8601()
  to?: string;
}
