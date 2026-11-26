import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ProposalInputDto {
  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}

export class CreateAppointmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsDateString()
  votingDeadline!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProposalInputDto)
  proposals?: ProposalInputDto[];
}
