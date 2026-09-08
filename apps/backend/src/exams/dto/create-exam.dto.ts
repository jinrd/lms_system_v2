import {
  IsEnum,
  IsISO8601,
  IsNumber,
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
 * 실제 시험 생성 요청이다.
 *
 * 이 단계 산출물은 항상 `status = DRAFT` 초안이다. `sourceTemplateId`가 있으면
 * 템플릿의 과목·필기 파트 구성·문제를 스냅샷으로 복사한다. 템플릿은 배점을
 * 갖지 않으므로, 필기 파트의 총점·합격점은 이 요청에서 받고 각 문제 배점은
 * 문제은행 기본 배점으로 채운 뒤 §14.9(예약 전 검증)에서 합계를 확인한다.
 * 템플릿이 없으면 빈 초안을 만든 뒤 파트·문제를 이어서 채운다.
 *
 * `opensAt`·`closesAt`은 시험 전체의 응시 기간이다. 예약(2단계) 시 파트들의 최소
 * 시작·최대 종료 시각과 일치하도록 재확인한다.
 */
export class CreateExamDto {
  @IsUUID()
  courseOfferingId!: string;

  @IsOptional()
  @IsUUID()
  sourceTemplateId?: string;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsEnum(ExamScope)
  scope!: ExamScope;

  @IsEnum(ExamStage)
  stage!: ExamStage;

  @IsISO8601()
  opensAt!: string;

  @IsISO8601()
  closesAt!: string;

  /**
   * 템플릿에서 필기 파트를 스냅샷할 때 쓸 필기 총점. 생략하면 100.
   * `sourceTemplateId`에 필기 파트가 있을 때만 의미가 있다.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  writtenTotalScore?: number;

  /**
   * 템플릿에서 필기 파트를 스냅샷할 때 쓸 필기 합격 점수.
   * `sourceTemplateId`에 필기 파트가 있으면 필수다.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999.99)
  writtenPassScore?: number;
}
