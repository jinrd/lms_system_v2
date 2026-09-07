import { IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { InquiryType } from '../../generated/prisma/enums';

/**
 * 학생의 문의 생성 요청이다(기획안 §11·§19.1).
 *
 * - `type = CLASS` → `classId` 필수. 본인이 활성 수강 중인 반이어야 한다.
 * - `type = GENERAL` → `classId`를 넣을 수 없다.
 */
export class CreateInquiryDto {
  @IsEnum(InquiryType)
  type!: InquiryType;

  @IsOptional()
  @IsUUID()
  classId?: string;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsString()
  @Length(1, 50000)
  content!: string;
}
