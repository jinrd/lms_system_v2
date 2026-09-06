import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';
import { ExamScope, ExamStage, ExamStatus } from '../../generated/prisma/enums';

/** 실제 시험 목록 조회의 필터다. 표준 페이지네이션 위에 얹는다. */
export class ExamQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  courseOfferingId?: string;

  @IsOptional()
  @IsEnum(ExamStatus)
  status?: ExamStatus;

  @IsOptional()
  @IsEnum(ExamStage)
  stage?: ExamStage;

  @IsOptional()
  @IsEnum(ExamScope)
  scope?: ExamScope;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  keyword?: string;
}
