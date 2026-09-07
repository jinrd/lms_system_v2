import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';
import { NoticeScope, NoticeType } from '../../generated/prisma/enums';

/** 공지 관리 목록 조회의 필터다. 표준 페이지네이션 위에 얹는다. */
export class NoticeQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(NoticeType)
  type?: NoticeType;

  @IsOptional()
  @IsEnum(NoticeScope)
  scope?: NoticeScope;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true')
  @IsBoolean()
  important?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  keyword?: string;
}
