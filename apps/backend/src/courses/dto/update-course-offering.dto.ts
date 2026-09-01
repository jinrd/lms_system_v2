import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class UpdateCourseOfferingDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsUUID()
  instructorId?: string;
}
