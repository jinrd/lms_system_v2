import { IsString, Length } from 'class-validator';

/** 문의 답글 작성 요청이다. 원문·답글은 이후 수정·삭제하지 않는다(§19.2). */
export class CreateInquiryReplyDto {
  @IsString()
  @Length(1, 50000)
  content!: string;
}
