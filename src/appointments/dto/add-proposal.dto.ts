import { IsDateString, IsOptional } from 'class-validator';

export class AddProposalDto {
  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}
