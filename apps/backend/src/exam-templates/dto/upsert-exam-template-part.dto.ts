import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** 실기 파트 파일 장수·전체 크기 상한이다. 템플릿은 이보다 엄격하게만 설정할 수 있다. */
export const PRACTICAL_MAX_FILES = 5;
export const PRACTICAL_MAX_TOTAL_SIZE_BYTES = 41_943_040;

/**
 * 실기 파트의 파일당 최대 크기다. 5MiB로 **무조건 고정**이며 클라이언트가 어떤
 * 값을 보내도 서버가 이 값으로 덮어쓴다. DB CHECK도 이 값만 허용한다.
 */
export const PRACTICAL_FILE_SIZE_BYTES = 5_242_880;

/**
 * 시험 템플릿의 필기 또는 실기 파트 upsert 요청이다.
 *
 * 파트 유형은 URL 경로(`/parts/:type`)로 받는다. 여기서는 값의 범위만 막고,
 * 유형별 필드 배타 규칙(필기=제한 시간만, 실기=파일 제한만)과 필수 여부는
 * 서비스가 검증한다(2단계 CHECK 제약과 같은 규칙).
 *
 * 파일 장수·전체 크기는 생략하면 기본 정책 값이 들어가고, 값을 넣더라도 상한을
 * 넘길 수 없다(완화 거부, 더 엄격한 값만 허용). 파일당 최대 크기는 예외로
 * 5MiB 고정이라 무엇을 보내든 무시된다.
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

  /** 무시된다. 서버가 항상 `PRACTICAL_FILE_SIZE_BYTES`(5MiB)로 고정한다. */
  @IsOptional()
  @IsInt()
  @Min(1)
  maxFileSizeBytes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PRACTICAL_MAX_TOTAL_SIZE_BYTES)
  maxTotalSizeBytes?: number;
}
