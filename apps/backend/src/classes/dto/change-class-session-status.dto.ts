import { IsDefined, IsIn, IsInt, Max, Min, ValidateIf } from 'class-validator';
import { SessionStatus } from '../../generated/prisma/enums';

export class ChangeClassSessionStatusDto {
  @IsIn([SessionStatus.IN_PROGRESS, SessionStatus.COMPLETED])
  status!: SessionStatus;

  @ValidateIf(
    (dto: ChangeClassSessionStatusDto) =>
      dto.status === SessionStatus.COMPLETED,
  )
  @IsDefined()
  @IsInt()
  @Min(1)
  @Max(1440)
  completedMinutes?: number;
}
