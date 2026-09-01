import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class WithdrawEnrollmentDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveOn!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
