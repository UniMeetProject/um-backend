import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class InviteDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  identifiers!: string[];
}
