import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * 제한 인증 상태에서 필수 약관에 동의하고 정식 세션을 받는 요청이다
 * (기획안 §7.2 / D-43). 기기 정보는 로그인과 동일하게 세션 생성에 쓴다.
 */
export class ConsentDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  agreedTermsDocumentIds!: string[];

  @IsUUID()
  deviceIdentifier!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  deviceName?: string;
}
