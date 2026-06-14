import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class RagRequestDto {
  @IsString()
  question: string;

  @IsNumber()
  @Min(1)
  @Max(10)
  @IsOptional()
  topK?: number;

  @IsString()
  @IsOptional()
  systemPrompt?: string;
}
