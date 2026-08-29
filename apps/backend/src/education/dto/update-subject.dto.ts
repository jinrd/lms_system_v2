import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { SubjectMode } from '../../generated/prisma/enums';

export class UpdateSubjectDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  objective?: string;

  @IsOptional()
  @IsEnum(SubjectMode)
  mode?: SubjectMode;

  @IsOptional()
  @IsInt()
  @Min(1)
  defaultDurationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}
