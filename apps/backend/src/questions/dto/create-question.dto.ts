import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DifficultyLevel, QuestionType } from '../../generated/prisma/enums';

/** 객관식 보기 한 건의 입력이다. 표시 순서는 서버가 배열 인덱스로 부여한다. */
export class QuestionOptionInput {
  @IsString()
  @Length(1, 2000)
  content!: string;

  @IsBoolean()
  isCorrect!: boolean;
}

/**
 * 문제은행 문제 생성 요청이다.
 *
 * 유형별 보기·허용 정답 개수 규칙(기획안 §12.1)은 DTO가 아니라 서비스의 저장
 * 트랜잭션에서 하위 행 개수를 보고 검증한다. 여기서는 값의 형태만 막는다.
 */
export class CreateQuestionDto {
  @IsUUID()
  subjectId!: string;

  @IsEnum(QuestionType)
  type!: QuestionType;

  @IsString()
  @Length(1, 10000)
  prompt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  explanation?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  defaultScore!: number;

  @IsEnum(DifficultyLevel)
  difficulty!: DifficultyLevel;

  @IsBoolean()
  active = true;

  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionInput)
  options: QuestionOptionInput[] = [];

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Length(1, 2000, { each: true })
  acceptedAnswers: string[] = [];
}
