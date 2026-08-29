import { IsString, Length } from 'class-validator';

export class ChangeUserStatusDto {
  @IsString()
  @Length(1, 500)
  reason!: string;
}
