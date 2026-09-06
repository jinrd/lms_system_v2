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
 * 시험 템플릿 생성 요청이다.
 *
 * 이 단계 산출물은 항상 `active = false` 초안이다. 문제 선택과 실기 평가 항목은
 * 5단계에서 별도로 채운다. `scope`에 따른 과목 개수 규칙(기획안 §13.2)과 과목
 * 활성 여부는 서비스에서 검증한다.
 */
export class CreateExamTemplateDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsEnum(ExamScope)
  scope!: ExamScope;

  @IsEnum(ExamStage)
  stage!: ExamStage;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  defaultOpenDays?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  subjectIds!: string[];
}
