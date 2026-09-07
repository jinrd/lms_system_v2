import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';
import { InquiryStatus, InquiryType } from '../../generated/prisma/enums';

/** 문의 목록 조회의 필터다. 표준 페이지네이션 위에 얹는다. */
export class InquiryQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(InquiryType)
  type?: InquiryType;

  @IsOptional()
  @IsEnum(InquiryStatus)
  status?: InquiryStatus;

  @IsOptional()
  @IsUUID()
  classId?: string;
}
