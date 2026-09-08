import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsUUID,
  ValidateNested,
} from 'class-validator';

/**
 * 시험 템플릿 필기 파트에 담을 문제 한 건이다. 표시 순서는 서버가 부여한다.
 * 배점은 템플릿에 저장하지 않는다(실제 시험 생성 시 결정).
 */
export class TemplateQuestionInput {
  @IsUUID()
  questionId!: string;
}

/**
 * 필기 파트의 문제 목록을 통째로 교체하는 요청이다.
 *
 * `(part_id, display_order)` 유니크 때문에 순서를 한 건씩 옮기면 중간에
 * 충돌한다. 그래서 전체 배열을 받아 전량 삭제 후 재삽입한다. 빈 배열이면
 * 문제를 모두 비운다.
 */
export class ReplaceTemplateQuestionsDto {
  /** 동시 편집 방지. 마지막으로 읽은 템플릿의 updatedAt(ISO). */
  @IsISO8601()
  expectedUpdatedAt!: string;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TemplateQuestionInput)
  questions: TemplateQuestionInput[] = [];
}
