import { IsEnum } from 'class-validator';
import { ClassStatus } from '../../generated/prisma/enums';

export class ChangeClassStatusDto {
  @IsEnum(ClassStatus)
  status!: ClassStatus;
}
