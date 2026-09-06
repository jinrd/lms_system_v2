import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * 필기 답안 한 문항의 자동 저장 요청이다.
 *
 * `version`은 마지막으로 받은 답안 버전이다. 서버가 가진 버전과 다르면 다른
 * 탭·기기의 저장이 앞섰다는 뜻이므로 409로 거부한다(기획안 §15.3). 단답형은
 * `subjectiveText`만, 객관식은 `selectedOptionIds`만 사용한다.
 */
export class SaveWrittenAnswerDto {
  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  subjectiveText?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  selectedOptionIds?: string[];
}
