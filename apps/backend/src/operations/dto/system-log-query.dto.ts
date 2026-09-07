import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

/** 시스템 로그 조회 필터다(기획안 §21.2). 표준 페이지네이션 위에 얹는다. */
export class SystemLogQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['INFO', 'WARN', 'ERROR'])
  level?: 'INFO' | 'WARN' | 'ERROR';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  errorCode?: string;

  @IsOptional()
  @IsUUID()
  requestId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  route?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
