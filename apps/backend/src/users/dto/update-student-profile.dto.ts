import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { Gender } from '../../generated/prisma/enums';

/**
 * 학생 개인정보 수정 요청이다(기획안 §3 / §6.2). 학생은 직접 수정할 수 없고,
 * 담당 강사·실장·원장·관리자가 권한 범위 안에서 수정하며 변경 전후 값과 작업자를
 * `audit_logs`에 남긴다.
 *
 * 보낸 필드만 바꾼다. `email`은 빈 문자열로 보내면 제거한다. 미성년으로 가입한
 * 학생의 보호자 정보는 비울 수 없다(계정 비활성화 시에만 제거).
 */
export class UpdateStudentProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9-]{10,20}$/)
  phone?: string;

  @IsOptional()
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  guardianName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9-]{10,20}$/)
  guardianPhone?: string;

  @IsString()
  @Length(1, 500)
  reason!: string;
}
