import { IsString, Length } from 'class-validator';

export class RejectUserDto {
  @IsString()
  @Length(1, 500)
  reason!: string;
}
