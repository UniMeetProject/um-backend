import { IsNotEmpty, IsString } from 'class-validator';

export class FinalizeDto {
  @IsString()
  @IsNotEmpty()
  proposalId!: string;
}
