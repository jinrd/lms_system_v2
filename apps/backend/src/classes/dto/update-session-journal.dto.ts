import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateSessionJournalDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  lessonContent!: string;
}
