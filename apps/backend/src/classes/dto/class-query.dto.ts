import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ClassStatus } from '../../generated/prisma/enums';

export class ClassQueryDto {
  @IsOptional()
  @IsEnum(ClassStatus)
  status?: ClassStatus;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
