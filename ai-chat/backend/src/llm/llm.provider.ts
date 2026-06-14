import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';

export const LLM_MODEL = 'LLM_MODEL';

/**
 * LLM Provider
 * 使用工厂模式创建 ChatOpenAI 实例
 * 支持通过环境变量配置，也可在运行时覆盖
 */
export const llmProvider: Provider = {
  provide: LLM_MODEL,
  useFactory: (configService: ConfigService): ChatOpenAI => {
    return new ChatOpenAI({
      apiKey: configService.get<string>('OPENAI_API_KEY'),
      configuration: {
        baseURL: configService.get<string>('OPENAI_BASE_URL'),
      },
      model: configService.get<string>('OPENAI_MODEL') || 'gpt-4o-mini',
      temperature: parseFloat(configService.get<string>('OPENAI_TEMPERATURE') || '0.7'),
      streaming: true,
    });
  },
  inject: [ConfigService],
};
