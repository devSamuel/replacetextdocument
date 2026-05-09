import { IsString, IsNotEmpty } from 'class-validator';

export class UnredactJsonDto {
  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsString()
  @IsNotEmpty()
  text!: string;
}
