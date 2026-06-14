import { IsString, IsOptional, IsNumber, Min, Max, IsBoolean } from 'class-validator';

/**
 * 增强向量检索请求 DTO
 */
export class EnhancedSearchDto {
  @IsString()
  query: string;

  @IsNumber()
  @Min(1)
  @Max(20)
  @IsOptional()
  limit?: number = 5;

  @IsBoolean()
  @IsOptional()
  extractCharacters?: boolean = true;

  @IsNumber()
  @Min(50)
  @Max(500)
  @IsOptional()
  excerptLength?: number = 200;
}
