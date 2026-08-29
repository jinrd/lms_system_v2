import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { SubjectMode } from '../../generated/prisma/enums';

export class CreateSubjectDto {
  @IsString()
  @Length(1, 150)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  objective?: string;

  @IsEnum(SubjectMode)
  mode!: SubjectMode;

  @IsOptional()
  @IsInt()
  @Min(1)
  defaultDurationMinutes?: number;

  @IsInt()
  @Min(0)
  displayOrder!: number;

  @IsBoolean()
  active = true;
}
