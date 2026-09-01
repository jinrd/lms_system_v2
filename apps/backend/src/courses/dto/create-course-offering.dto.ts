import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class CreateCourseOfferingDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsUUID()
  primaryEducationFieldId!: string;

  @IsUUID()
  instructorId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  subjectIds!: string[];
}
