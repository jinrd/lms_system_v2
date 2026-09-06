import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { QuestionType } from '../../generated/prisma/enums';

/** 직접 입력 문제의 객관식 보기 한 건이다. 표시 순서는 서버가 부여한다. */
export class ExamQuestionOptionInput {
  @IsString()
  @Length(1, 2000)
  content!: string;

  @IsBoolean()
  isCorrect!: boolean;
}

/**
 * 실제 시험 필기 파트에 담을 문제 한 건이다.
 *
 * `sourceQuestionId`가 있으면 문제은행 문제를 스냅샷으로 복사한다(유형·본문·해설·
 * 보기·허용 정답을 값으로 가져온다). 없으면 `type`·`prompt`로 직접 입력하며,
 * 이 경우 시험의 대상 과목이 정확히 1개여야 한다(과목 귀속이 모호해지지 않도록).
 */
export class ExamQuestionInput {
  @IsOptional()
  @IsUUID()
  sourceQuestionId?: string;

  @IsOptional()
  @IsEnum(QuestionType)
  type?: QuestionType;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  prompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  explanation?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ExamQuestionOptionInput)
  options?: ExamQuestionOptionInput[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 500, { each: true })
  acceptedAnswers?: string[];

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  score!: number;
}

/**
 * 필기 파트의 문제 목록을 통째로 교체하는 요청이다.
 *
 * `(exam_part_id, display_order)` 유니크 때문에 순서를 한 건씩 옮기면 중간에
 * 충돌한다. 그래서 전체 배열을 받아 전량 삭제 후 재삽입한다. 빈 배열이면
 * 문제를 모두 비운다(초안 편집 중 정상).
 */
export class ReplaceExamQuestionsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ExamQuestionInput)
  questions: ExamQuestionInput[] = [];
}
