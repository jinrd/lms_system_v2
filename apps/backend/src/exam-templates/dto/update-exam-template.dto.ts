import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ExamScope, ExamStage } from '../../generated/prisma/enums';

/**
 * 시험 템플릿 기본 정보·과목 수정 요청이다.
 *
 * `subjectIds`를 보내면 과목 구성을 전량 교체하며, 이때 선택된 문제 중 빠지는
 * 과목의 문제가 있으면 거부한다. 동시 편집은 `expectedUpdatedAt`으로 막는다.
 */
export class UpdateExamTemplateDto {
  /** 동시 편집 방지. 마지막으로 읽은 템플릿의 updatedAt(ISO). */
  @IsISO8601()
  expectedUpdatedAt!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

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
  @IsInt()
  @Min(1)
  @Max(365)
  defaultOpenDays?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  subjectIds?: string[];
}
