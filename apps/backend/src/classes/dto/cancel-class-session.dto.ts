import { IsString, Length } from 'class-validator';

export class CancelClassSessionDto {
  @IsString()
  @Length(1, 1000)
  reason!: string;
}
