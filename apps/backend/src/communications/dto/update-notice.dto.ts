import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

/**
 * 공지 수정 요청이다. `type`·`scope`는 바꿀 수 없다(바꾸려면 삭제 후 재작성).
 *
 * `publishedFrom`·`publishedUntil`에 `null`을 보내면 해당 게시 시각을 비운다.
 * `classTargetIds`는 `scope = CLASSES` 공지에서만 의미가 있으며 전량 교체한다.
 */
export class UpdateNoticeDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50000)
  content?: string;

  @IsOptional()
  @IsBoolean()
  important?: boolean;

  @IsOptional()
  @IsISO8601()
  publishedFrom?: string | null;

  @IsOptional()
  @IsISO8601()
  publishedUntil?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  classTargetIds?: string[];
}
