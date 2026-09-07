import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';
import {
  LIFECYCLE_JOB_TYPES,
  type LifecycleJobType,
} from '../data-lifecycle.service';

/** 데이터 생명주기 배치 실행 이력 조회 필터다(기획안 §21.4). */
export class LifecycleRunQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(LIFECYCLE_JOB_TYPES)
  jobType?: LifecycleJobType;

  @IsOptional()
  @IsIn(['RUNNING', 'SUCCESS', 'PARTIAL_FAILURE', 'FAILURE'])
  status?: 'RUNNING' | 'SUCCESS' | 'PARTIAL_FAILURE' | 'FAILURE';
}
