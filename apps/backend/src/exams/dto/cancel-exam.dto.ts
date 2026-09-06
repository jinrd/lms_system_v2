import { IsString, Length } from 'class-validator';

/**
 * 시험 취소 요청이다(기획안 §14.1·D-31).
 *
 * 취소는 되돌릴 수 없고, 재개가 필요하면 새 시험으로 복제한다. 사유는 필수다.
 */
export class CancelExamDto {
  @IsString()
  @Length(1, 1000)
  reason!: string;
}
