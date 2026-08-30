import { IsIn, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { EnrollmentType } from '../../generated/prisma/enums';

export class AssignSessionParticipantDto {
  @IsUUID()
  sourceEnrollmentId!: string;

  @IsIn([EnrollmentType.SUPPLEMENT, EnrollmentType.MAKEUP])
  type!: EnrollmentType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
