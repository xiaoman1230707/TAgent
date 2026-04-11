import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbQueryController } from './db-query.controller';
import { DbQueryService } from './db-query.service';

@Module({
  imports: [ConfigModule],
  controllers: [DbQueryController],
  providers: [DbQueryService],
  exports: [DbQueryService],
})
export class DbQueryModule {}
