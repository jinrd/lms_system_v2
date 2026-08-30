import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { EnrollmentType } from '../../generated/prisma/enums';

export class CreateSubjectEnrollmentDto {
  @IsUUID()
  sourceEnrollmentId!: string;

  @IsUUID()
  courseOfferingSubjectId!: string;

  @IsIn([EnrollmentType.SUPPLEMENT, EnrollmentType.MAKEUP])
  type!: EnrollmentType;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startsOn!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endsOn!: string;

  @IsOptional()
  @IsBoolean()
  attendanceManaged?: boolean;

  @IsOptional()
  @IsBoolean()
  gradeManaged?: boolean;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
