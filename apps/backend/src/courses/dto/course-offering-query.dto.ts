import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CourseOfferingQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  keyword?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true')
  @IsBoolean()
  archived?: boolean;

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
