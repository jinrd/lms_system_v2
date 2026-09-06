import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PassStatus } from '../../generated/prisma/enums';

/**
 * 시험 결과 정정 요청이다(기획안 §15.6·D-28).
 *
 * 사유는 필수다. 넘기지 않은 항목은 현재 값을 유지한다. 정정 전후 값·사유·
 * 정정자·시각은 수정 불가능한 이력으로 보존되며, 공개된 결과를 정정해도 다시
 * 비공개로 돌리지 않는다.
 */
export class ReviseExamResultDto {
  @IsString()
  @Length(1, 1000)
  reason!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999.99)
  writtenScore?: number;

  @IsOptional()
  @IsEnum(PassStatus)
  writtenResult?: PassStatus;

  @IsOptional()
  @IsEnum(PassStatus)
  finalResult?: PassStatus;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  writtenFeedback?: string;
}
