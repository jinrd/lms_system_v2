import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AttendanceStatus } from '../../generated/prisma/enums';

export class UpdateAttendanceDto {
  @IsEnum(AttendanceStatus)
  status!: AttendanceStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  checkedAt?: Date;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
