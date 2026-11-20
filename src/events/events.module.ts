import { Global, Module } from '@nestjs/common';
import { EVENT_PUBLISHER } from './event-publisher';
import { InMemoryEventPublisher } from './in-memory-event-publisher';

@Global()
@Module({
  providers: [{ provide: EVENT_PUBLISHER, useClass: InMemoryEventPublisher }],
  exports: [EVENT_PUBLISHER],
})
export class EventsModule {}
