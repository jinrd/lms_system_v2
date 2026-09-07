import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { NoticeScope, NoticeType } from '../../generated/prisma/enums';

/**
 * 공지 작성 요청이다(기획안 §18.1·D-08).
 *
 * - `type = INSTRUCTOR`(강사 공지)는 `scope = ALL`만, 실장·원장·관리자만 작성한다.
 * - `type = STUDENT`, `scope = ALL`(전체 학생 공지)도 실장·원장·관리자만.
 * - `type = STUDENT`, `scope = CLASSES`는 강사가 본인 담당 반에만. 대상 반 1개 이상.
 */
export class CreateNoticeDto {
  @IsEnum(NoticeType)
  type!: NoticeType;

  @IsEnum(NoticeScope)
  scope!: NoticeScope;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsString()
  @Length(1, 50000)
  content!: string;

  @IsOptional()
  @IsBoolean()
  important?: boolean;

  @IsOptional()
  @IsISO8601()
  publishedFrom?: string;

  @IsOptional()
  @IsISO8601()
  publishedUntil?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  classTargetIds?: string[];
}
