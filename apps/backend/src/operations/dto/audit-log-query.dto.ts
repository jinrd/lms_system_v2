import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';
import { AuditResult, UserRole } from '../../generated/prisma/enums';

/**
 * 감사 로그 조회 필터다(기획안 §14.1·§21.1). 표준 페이지네이션 위에 얹으며
 * 기간·작업자·자원·작업 종류로 좁힌다. 대량 조회를 피하도록 기간 필터를 권장한다.
 */
export class AuditLogQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsEnum(UserRole)
  actorRole?: UserRole;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  resourceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  resourceId?: string;

  @IsOptional()
  @IsEnum(AuditResult)
  result?: AuditResult;

  @IsOptional()
  @IsUUID()
  requestId?: string;

  /** 이 시각 이후(포함)에 기록된 로그만. */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** 이 시각 이전(포함)에 기록된 로그만. */
  @IsOptional()
  @IsISO8601()
  to?: string;
}
