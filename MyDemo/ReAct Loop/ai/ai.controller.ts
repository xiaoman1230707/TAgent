import {
  Controller,
  Query,
  Sse, // Server Sent Events
} from '@nestjs/common';
import { AiService } from './ai.service';
import { SessionService } from '../session/session.service';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';


@Controller('agent')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly sessionService: SessionService,
  ) {}

  // @Get('chat')
  // async chat(@Query("query") query:string){
  //   const answer = await this.aiService.runChain(query)
  //   return{
  //     answer,
  //   }
  // }
  // 装饰器模式 
  // 什么叫做 sse server sent events
  // 设置的几个响应头 
  // Content-Type: text/event-stream
  // Connection: keep-alive
  // Cache-Control: no-cache 别缓存 有很多 
  // Transfer-Encoding: chunked 分块传输
  @Sse('stream')
  chatStream(
    @Query("query") query: string,
    @Query("sessionId") sessionId?: string,
  ): Observable<MessageEvent> {
    // 获取或创建 session
    const session = this.sessionService.getOrCreate(sessionId);
    const stream = this.aiService.runChainStream(query, session.id);
    // 将llm stream 转换为一个 Observable 对象
    return from(stream).pipe(
      map((chunk) => ({
        // 前端需要的chunk格式约定
        data: chunk
      })),
    ) as Observable<MessageEvent>;
  }
}
