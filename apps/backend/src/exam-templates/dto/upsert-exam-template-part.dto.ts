import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** 실기 파트 파일 제한의 상한이다. 템플릿은 이보다 엄격하게만 설정할 수 있다. */
export const PRACTICAL_MAX_FILES = 5;
export const PRACTICAL_MAX_FILE_SIZE_BYTES = 10_485_760;
export const PRACTICAL_MAX_TOTAL_SIZE_BYTES = 41_943_040;

/**
 * 시험 템플릿의 필기 또는 실기 파트 upsert 요청이다.
 *
 * 파트 유형은 URL 경로(`/parts/:type`)로 받는다. 여기서는 값의 범위만 막고,
 * 유형별 필드 배타 규칙(필기=제한 시간만, 실기=파일 제한만)과 필수 여부는
 * 서비스가 검증한다(2단계 CHECK 제약과 같은 규칙).
 *
 * 파일 제한은 생략하면 §8.5의 기본 정책 값이 들어간다. 값을 넣더라도 상한을
 * 넘길 수 없고(완화 거부), 더 엄격한 값만 허용한다.
 */
export class UpsertExamTemplatePartDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  totalScore!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999.99)
  passScore!: number;

  @IsInt()
  @Min(0)
  @Max(3650)
  defaultOpenOffsetDays!: number;

  @IsInt()
  @Min(1)
  @Max(365)
  defaultOpenDays!: number;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  instructions?: string;

  /** 필기 파트 전용. 필기 파트에서는 필수, 실기 파트에서는 넣을 수 없다. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  durationMinutes?: number;

  /** 실기 파트 전용. 실기 파트에서는 필수, 필기 파트에서는 넣을 수 없다. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PRACTICAL_MAX_FILES)
  minFiles?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PRACTICAL_MAX_FILES)
  maxFiles?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PRACTICAL_MAX_FILE_SIZE_BYTES)
  maxFileSizeBytes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PRACTICAL_MAX_TOTAL_SIZE_BYTES)
  maxTotalSizeBytes?: number;
}
