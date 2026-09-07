import { IsIn, IsISO8601, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

/** 백업 실행 이력 조회 필터다(기획안 §21.3). */
export class BackupQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['RUNNING', 'SUCCESS', 'FAILURE'])
  status?: 'RUNNING' | 'SUCCESS' | 'FAILURE';

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
