import { IsString, IsUUID, Matches } from 'class-validator';

export class SubmitAttendanceCodeDto {
  @IsUUID()
  classSessionId!: string;

  @IsString()
  @Matches(/^\d{4}$/)
  code!: string;
}
