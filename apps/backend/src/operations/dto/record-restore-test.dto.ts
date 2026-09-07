import { IsIn } from 'class-validator';

/** 별도 환경에서 수행한 복구 테스트 결과를 백업 실행 이력에 기록한다(기획안 §14.5). */
export class RecordRestoreTestDto {
  @IsIn(['SUCCESS', 'FAILURE'])
  result!: 'SUCCESS' | 'FAILURE';
}
