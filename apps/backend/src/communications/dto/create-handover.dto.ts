import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

/**
 * 강사 변경 시 반 인수인계 문서를 만든다(기획안 §12·§20.1).
 *
 * 실제 담당 이력은 교육과정의 강사 배정에서 관리하고, 이 문서는 인계 내용과
 * 새 강사의 확인 여부만 기록한다. `fromInstructorId`는 퇴사 등으로 계정이
 * 비활성일 수 있어 선택값이다.
 */
export class CreateHandoverDto {
  @IsUUID()
  classId!: string;

  @IsUUID()
  toInstructorId!: string;

  @IsOptional()
  @IsUUID()
  fromInstructorId?: string;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsString()
  @Length(1, 50000)
  content!: string;
}
