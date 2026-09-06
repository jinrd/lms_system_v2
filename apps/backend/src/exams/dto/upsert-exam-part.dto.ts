import {
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PRACTICAL_FILE_SIZE_BYTES,
  PRACTICAL_MAX_FILES,
  PRACTICAL_MAX_TOTAL_SIZE_BYTES,
} from '../../exam-templates/dto/upsert-exam-template-part.dto';

export {
  PRACTICAL_FILE_SIZE_BYTES,
  PRACTICAL_MAX_FILES,
  PRACTICAL_MAX_TOTAL_SIZE_BYTES,
};

/**
 * 실제 시험의 필기 또는 실기 파트 upsert 요청이다.
 *
 * 파트 유형은 URL 경로(`/parts/:type`)로 받는다. 템플릿 파트와 달리 상대 오프셋
 * 일수가 아니라 실제 시작·종료 시각(`opensAt`·`closesAt`)을 직접 받는다. 유형별
 * 필드 배타 규칙(필기=제한 시간만, 실기=파일 제한만)은 서비스가 검증하며 DB
 * CHECK가 최종 방어선이다(기획안 §14.4).
 *
 * 파일당 최대 크기는 예외로 5MiB 고정이라 무엇을 보내든 무시된다(D-49).
 */
export class UpsertExamPartDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  totalScore!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999.99)
  passScore!: number;

  @IsISO8601()
  opensAt!: string;

  @IsISO8601()
  closesAt!: string;

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
  @Max(PRACTICAL_MAX_TOTAL_SIZE_BYTES)
  maxTotalSizeBytes?: number;
}
