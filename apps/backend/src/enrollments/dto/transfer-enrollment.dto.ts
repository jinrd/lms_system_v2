import {
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class TransferEnrollmentDto {
  @IsUUID()
  targetClassId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  transferOn!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
