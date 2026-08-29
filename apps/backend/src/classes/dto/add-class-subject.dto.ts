import { IsUUID } from 'class-validator';

export class AddClassSubjectDto {
  @IsUUID()
  courseOfferingSubjectId!: string;
}
