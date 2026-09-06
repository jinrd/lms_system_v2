import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** 시험 템플릿 필기 파트에 담을 문제 한 건이다. 표시 순서는 서버가 부여한다. */
export class TemplateQuestionInput {
  @IsUUID()
  questionId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  score!: number;
}

/**
 * 필기 파트의 문제 목록을 통째로 교체하는 요청이다.
 *
 * `(part_id, display_order)` 유니크 때문에 순서를 한 건씩 옮기면 중간에
 * 충돌한다. 그래서 전체 배열을 받아 전량 삭제 후 재삽입한다. 빈 배열이면
 * 문제를 모두 비운다(초안 편집 중 정상).
 */
export class ReplaceTemplateQuestionsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TemplateQuestionInput)
  questions: TemplateQuestionInput[] = [];
}
