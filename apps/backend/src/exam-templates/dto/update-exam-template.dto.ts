import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
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
 * 활성 템플릿은 수정할 수 없다(기획안 §13.6). `subjectIds`를 보내면 과목 구성을
 * 전량 교체하며, 이때 5단계에서 선택된 문제 중 빠지는 과목의 문제가 있으면
 * 거부한다.
 */
export class UpdateExamTemplateDto {
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
