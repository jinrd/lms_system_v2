import { IsEnum, IsString, Length } from 'class-validator';
import { CourseStatus } from '../../generated/prisma/enums';

export class ChangeCourseStatusDto {
  @IsEnum(CourseStatus)
  status!: CourseStatus;

  @IsString()
  @Length(1, 500)
  reason!: string;
}
