import { IsBoolean } from 'class-validator';

export class ChangeCourseArchiveDto {
  @IsBoolean()
  archived!: boolean;
}
