import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class AddCourseOfferingSubjectDto {
  @IsUUID()
  subjectId!: string;

  @IsInt()
  @Min(1)
  sequence!: number;

  @IsOptional()
  @IsDateString()
  plannedStartDate?: string;

  @IsOptional()
  @IsDateString()
  plannedEndDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  plannedMinutes?: number;

  @IsOptional()
  @IsString()
  curriculum?: string;
}
