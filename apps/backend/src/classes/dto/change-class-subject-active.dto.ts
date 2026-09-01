import { IsBoolean } from 'class-validator';

export class ChangeClassSubjectActiveDto {
  @IsBoolean()
  active!: boolean;
}
