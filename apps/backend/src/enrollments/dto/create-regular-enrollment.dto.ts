import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateRegularEnrollmentDto {
  @IsUUID()
  studentId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startsOn!: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endsOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
