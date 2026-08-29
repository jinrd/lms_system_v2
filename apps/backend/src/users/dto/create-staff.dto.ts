import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { UserRole } from '../../generated/prisma/enums';

const STAFF_ROLES = [
  UserRole.INSTRUCTOR,
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
] as const;

export class CreateStaffDto {
  @Transform(({ value }: TransformFnParams): unknown => {
    const input: unknown = value;

    return typeof input === 'string' ? input.trim().toLowerCase() : input;
  })
  @IsString()
  @Matches(/^[a-z0-9._-]{4,30}$/)
  loginId!: string;

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

  @IsIn(STAFF_ROLES)
  role!: UserRole;
}

export type CreateStaffResponse = {
  id: string;
  loginId: string;
  name: string;
  role: UserRole;
  temporaryPassword: string;
  temporaryPasswordExpiresAt: string;
};
