import { IsUUID } from 'class-validator';

/**
 * 반에 배정되는 학생은 이미 수강을 확정한 학생이다.
 * 수강 기간은 반 운영 기간을 그대로 따르므로 따로 입력하지 않는다.
 */
export class CreateRegularEnrollmentDto {
  @IsUUID()
  studentId!: string;
}
