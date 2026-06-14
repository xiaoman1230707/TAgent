import { IsString, IsOptional, IsObject, IsEnum } from 'class-validator';
import { QueryType } from '../enums/query-type.enum';

/**
 * 查询路由请求 DTO
 */
export class RouterRequestDto {
  @IsString()
  query: string;

  @IsEnum(QueryType)
  @IsOptional()
  forceType?: QueryType; // 强制指定类型，跳过自动路由

  @IsObject()
  @IsOptional()
  context?: Record<string, any>; // 上下文信息
}

/**
 * 流式路由请求 DTO
 */
export class RouterStreamRequestDto extends RouterRequestDto {
  @IsString()
  @IsOptional()
  systemPrompt?: string;
}
