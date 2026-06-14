import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MilvusClient } from '@zilliz/milvus2-sdk-node';

export const MILVUS_CLIENT = 'MILVUS_CLIENT';

/**
 * Milvus 向量数据库 Provider
 * 复用 MyDemo/rag-book 中的连接逻辑
 */
export const milvusProvider: Provider = {
  provide: MILVUS_CLIENT,
  useFactory: (configService: ConfigService): MilvusClient => {
    const address = configService.get<string>('MILVUS_ADDRESS');
    const token = configService.get<string>('MILVUS_TOKEN');

    if (!address || !token) {
      throw new Error('MILVUS_ADDRESS and MILVUS_TOKEN must be configured');
    }

    return new MilvusClient({
      address,
      token,
    });
  },
  inject: [ConfigService],
};
