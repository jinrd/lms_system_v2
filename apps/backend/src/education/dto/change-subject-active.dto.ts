import { IsBoolean, IsString, Length } from 'class-validator';

export class ChangeSubjectActiveDto {
  @IsBoolean()
  active!: boolean;

  @IsString()
  @Length(1, 500)
  reason!: string;
}
