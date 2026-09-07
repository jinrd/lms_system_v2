import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ExamPartType } from '../../generated/prisma/enums';

/** 예약된 시험의 한 파트에 대한 일정 변경이다. 넘기지 않은 값은 유지한다. */
export class RescheduleExamPartDto {
  @IsEnum(ExamPartType)
  type!: ExamPartType;

  @IsOptional()
  @IsISO8601()
  opensAt?: string;

  @IsOptional()
  @IsISO8601()
  closesAt?: string;

  /** 필기 파트 전용 제한 시간. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes?: number;
}

/**
 * 예약된(`SCHEDULED`) 시험의 파트 시각·제한 시간을 조정한다(기획안 §14.1·D-33).
 *
 * 가장 이른 파트가 시작되기 전에만 허용한다. 시험 전체 응시 기간은 파트 봉투에
 * 맞춰 서버가 다시 계산한다. 문제·과목·대상 반은 이 API로 바꿀 수 없다.
 */
export class RescheduleExamDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RescheduleExamPartDto)
  parts!: RescheduleExamPartDto[];
}
