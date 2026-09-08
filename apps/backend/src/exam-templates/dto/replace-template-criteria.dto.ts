import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** 실기 파트의 평가 항목 한 건이다. 표시 순서는 서버가 부여한다. */
export class TemplateCriterionInput {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  maxScore!: number;
}

/**
 * 실기 파트의 평가 항목 목록을 통째로 교체하는 요청이다.
 *
 * 문제 목록과 같은 이유로 전량 교체한다. 빈 배열이면 항목을 모두 비운다.
 */
export class ReplaceTemplateCriteriaDto {
  /** 동시 편집 방지. 마지막으로 읽은 템플릿의 updatedAt(ISO). */
  @IsISO8601()
  expectedUpdatedAt!: string;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TemplateCriterionInput)
  criteria: TemplateCriterionInput[] = [];
}
