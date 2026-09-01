import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateClassDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  room?: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsInt()
  @Min(1)
  capacity!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  programIds!: string[];
}
