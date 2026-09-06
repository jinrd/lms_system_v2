import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import { ExamScope, ExamStage } from '../../generated/prisma/enums';

/**
 * 실제 시험 생성 요청이다.
 *
 * 이 단계 산출물은 항상 `status = DRAFT` 초안이다. `sourceTemplateId`가 있으면
 * 활성 템플릿의 과목·파트·문제·실기 기준을 불변 스냅샷으로 복사하고, 없으면 빈
 * 초안을 만든 뒤 파트·문제를 이어서 채운다(기획안 §14.5·§14.9).
 *
 * `opensAt`·`closesAt`은 시험 전체의 응시 기간이다. 예약(2단계) 시 파트들의 최소
 * 시작·최대 종료 시각과 일치하도록 재확인한다.
 */
export class CreateExamDto {
  @IsUUID()
  courseOfferingId!: string;

  @IsOptional()
  @IsUUID()
  sourceTemplateId?: string;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsEnum(ExamScope)
  scope!: ExamScope;

  @IsEnum(ExamStage)
  stage!: ExamStage;

  @IsISO8601()
  opensAt!: string;

  @IsISO8601()
  closesAt!: string;
}
