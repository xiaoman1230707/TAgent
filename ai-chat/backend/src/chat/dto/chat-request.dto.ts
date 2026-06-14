import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class ChatRequestDto {
  @IsString()
  message: string;

  @IsString()
  @IsOptional()
  systemPrompt?: string;

  @IsNumber()
  @Min(0)
  @Max(2)
  @IsOptional()
  temperature?: number;

  @IsString()
  @IsOptional()
  model?: string;
}
