import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';

/** 인수인계 목록 조회 필터다. 표준 페이지네이션 위에 얹는다. */
export class HandoverQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  classId?: string;

  /** true면 새 강사가 아직 확인하지 않은 건만, false면 확인 완료 건만. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true')
  @IsBoolean()
  acknowledged?: boolean;
}
