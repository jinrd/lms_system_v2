import { IsOptional, IsString, Length } from 'class-validator';

/**
 * 인수인계 문서 수정 요청이다. 새 강사가 확인하기 전에만, 제목·내용만 바꾼다.
 * 대상 반과 강사는 바꿀 수 없다(바꾸려면 삭제 후 재작성).
 */
export class UpdateHandoverDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50000)
  content?: string;
}
