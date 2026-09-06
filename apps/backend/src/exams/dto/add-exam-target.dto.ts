import { IsUUID } from 'class-validator';

/**
 * 자동 후보에서 빠진 학생을 시험 대상 명단에 수동으로 추가하는 요청이다.
 *
 * 추가하려는 학생도 시험의 모든 과목에 대한 성적 관리 자격이 있어야 하며,
 * 자격 자체를 우회할 수는 없다(기획안 §15.1).
 */
export class AddExamTargetDto {
  @IsUUID()
  studentId!: string;
}
