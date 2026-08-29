import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class LoginDto {
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

  @IsUUID()
  deviceIdentifier!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  deviceName?: string;
}
