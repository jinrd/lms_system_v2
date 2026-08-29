import { IsBoolean, IsDateString, IsString, Length } from 'class-validator';

export class CreateTermsDocumentDto {
  @IsString()
  @Length(1, 50)
  type!: string;

  @IsString()
  @Length(1, 30)
  version!: string;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsString()
  @Length(1, 100_000)
  content!: string;

  @IsBoolean()
  required!: boolean;

  @IsDateString()
  effectiveAt!: string;

  @IsBoolean()
  activate!: boolean;
}
