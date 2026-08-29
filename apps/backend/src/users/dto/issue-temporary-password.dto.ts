import { IsString, Length } from 'class-validator';

export class IssueTemporaryPasswordDto {
  @IsString()
  @Length(1, 500)
  reason!: string;
}

export type IssueTemporaryPasswordResponse = {
  userId: string;
  temporaryPassword: string;
  temporaryPasswordExpiresAt: string;
};
