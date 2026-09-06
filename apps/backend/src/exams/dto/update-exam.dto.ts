import {
  ArrayUnique,
  IsArray,
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
 * 초안(`DRAFT`) 시험의 기본 정보·대상 과목·대상 반 수정 요청이다.
 *
 * 예약된 시험은 이 API로 수정할 수 없다(§14.9). `subjectIds`는 세부 과목
 * 식별자이며, 서비스가 시험의 개설 강의에 해당하는 `course_offering_subjects`로
 * 변환한다. `classTargetIds`는 시험의 개설 강의에 속한 반이어야 한다.
 */
export class UpdateExamDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsEnum(ExamScope)
  scope?: ExamScope;

  @IsOptional()
  @IsEnum(ExamStage)
  stage?: ExamStage;

  @IsOptional()
  @IsISO8601()
  opensAt?: string;

  @IsOptional()
  @IsISO8601()
  closesAt?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  subjectIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  classTargetIds?: string[];
}
