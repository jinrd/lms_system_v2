import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsString,
  Length,
} from 'class-validator';
import { TERMS_TYPES, type TermsType } from '../terms.constants';

export class UpdateTermsDocumentDto {
  @IsIn(TERMS_TYPES)
  type!: TermsType;

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
}
