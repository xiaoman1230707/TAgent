import { Controller, Get, Query, Sse, Logger } from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { RagService } from './rag.service';
import { SessionService } from '../session/session.service';

@Controller('rag')
export class RagController {
  private readonly logger = new Logger(RagController.name);

  constructor(
    private readonly ragService: RagService,
    private readonly sessionService: SessionService,
  ) {}

  @Sse('stream')
  stream(
    @Query('query') query: string,
    @Query('sessionId') sessionId?: string,
  ): Observable<MessageEvent> {
    if (!query) {
      return from([{ type: 'error', error: 'Query is required' }]).pipe(
        map((data) => ({ data }) as MessageEvent),
      );
    }

    const session = this.sessionService.getOrCreate(sessionId);
    this.logger.log(`RAG stream for session: ${session.id}`);

    const stream = this.ragService.streamAnswer(query, session.id);

    return from(stream).pipe(
      map((chunk) => ({ data: chunk }) as MessageEvent),
    );
  }
}
