import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class AssignClassInstructorDto {
  @IsUUID()
  instructorId!: string;

  @IsDateString()
  assignedFrom!: string;

  @IsString()
  @Length(1, 500)
  reason!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  handoverTitle?: string;

  @IsOptional()
  @IsString()
  @Length(1, 10_000)
  handoverContent?: string;
}
