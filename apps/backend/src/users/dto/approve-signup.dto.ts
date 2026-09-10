import { IsIn } from 'class-validator';
import { UserRole } from '../../generated/prisma/enums';

/**
 * 승인 시 부여 가능한 역할. 실제로 어떤 역할까지 부여할 수 있는지는
 * 승인자 역할에 따라 서비스에서 다시 검사한다(기획안 §6.1 / D-18).
 */
const GRANTABLE_ROLES = [
  UserRole.STUDENT,
  UserRole.INSTRUCTOR,
  UserRole.MANAGER,
  UserRole.PRINCIPAL,
  UserRole.ADMIN,
] as const;

export class ApproveSignupDto {
  @IsIn(GRANTABLE_ROLES)
  role!: UserRole;
}
