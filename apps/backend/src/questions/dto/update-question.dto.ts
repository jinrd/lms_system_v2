import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
import { QuestionOptionInput } from './create-question.dto';

/**
 * 문제은행 문제 수정 요청이다.
 *
 * `options` 또는 `acceptedAnswers`를 보내면 해당 목록을 전량 교체한다. 둘 다
 * 생략하고 `type`도 바꾸지 않으면 기존 보기·정답을 그대로 둔다. `type`을 바꾸면
 * 새 유형 규칙에 맞는 목록을 함께 보내야 한다.
 */
export class UpdateQuestionDto {
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsEnum(QuestionType)
  type?: QuestionType;

  @IsOptional()
  @IsString()
  @Length(1, 10000)
  prompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  explanation?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999.99)
  defaultScore?: number;

  @IsOptional()
  @IsEnum(DifficultyLevel)
  difficulty?: DifficultyLevel;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionInput)
  options?: QuestionOptionInput[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Length(1, 2000, { each: true })
  acceptedAnswers?: string[];
}
