import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** 실제 시험 실기 파트의 평가 항목 한 건이다. 표시 순서는 서버가 부여한다. */
export class ExamCriterionInput {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  maxScore!: number;
}

/**
 * 실기 파트의 평가 항목을 통째로 교체하는 요청이다.
 *
 * 순서 유니크 제약 때문에 전량 삭제 후 재삽입한다. 빈 배열이면 항목을 모두
 * 비운다(초안 편집 중 정상).
 */
export class ReplaceExamPracticalCriteriaDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ExamCriterionInput)
  criteria: ExamCriterionInput[] = [];
}
