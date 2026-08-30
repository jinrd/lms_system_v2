import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { EnrollmentStatus } from '../../generated/prisma/enums';

export class ChangeEnrollmentStatusDto {
  @IsEnum(EnrollmentStatus)
  status!: EnrollmentStatus;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveOn?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
