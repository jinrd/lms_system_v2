import { Transform, type TransformFnParams } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Gender, UserStatus } from '../../generated/prisma/enums';

export class SignupDto {
  @Transform(({ value }: TransformFnParams): unknown => {
    const input: unknown = value;

    return typeof input === 'string' ? input.trim().toLowerCase() : input;
  })
  @IsString()
  @Matches(/^[a-z0-9._-]{4,30}$/)
  loginId!: string;

  @IsString()
  @Length(8, 64)
  password!: string;

  @IsString()
  @Length(1, 100)
  name!: string;

  @IsString()
  @Matches(/^[0-9-]{10,20}$/)
  phone!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsDateString()
  birthDate!: string;

  @IsEnum(Gender)
  gender!: Gender;

  @IsBoolean()
  isMinorAtSignup!: boolean;

  @ValidateIf((dto: SignupDto) => dto.isMinorAtSignup)
  @IsString()
  @Length(1, 100)
  guardianName?: string;

  @ValidateIf((dto: SignupDto) => dto.isMinorAtSignup)
  @IsString()
  @Matches(/^[0-9-]{10,20}$/)
  guardianPhone?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  agreedTermsDocumentIds!: string[];
}

export type SignupResponse = {
  id: string;
  status: UserStatus;
};
