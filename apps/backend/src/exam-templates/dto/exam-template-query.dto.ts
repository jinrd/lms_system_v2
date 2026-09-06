import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination';
import { ExamScope, ExamStage } from '../../generated/prisma/enums';

/** 시험 템플릿 목록 조회의 필터다. 표준 페이지네이션 위에 얹는다. */
export class ExamTemplateQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ExamScope)
  scope?: ExamScope;

  @IsOptional()
  @IsEnum(ExamStage)
  stage?: ExamStage;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true')
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  keyword?: string;
}
