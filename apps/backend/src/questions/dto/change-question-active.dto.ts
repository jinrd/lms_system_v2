import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

/**
 * 문제 출제 가능 여부 전환 요청이다.
 *
 * `active = true`로 바꿀 때는 서비스가 유형별 보기·정답 규칙을 다시 검증한다.
 * `false` 전환은 검증 없이 허용한다(기획안 §23: 시험에서 사용 중이면 비활성화).
 */
export class ChangeQuestionActiveDto {
  @IsBoolean()
  active!: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;
}
