import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { TraceIdMiddleware } from './trace-id.middleware';

@Module({
  providers: [TraceIdMiddleware],
  exports: [TraceIdMiddleware],
})
export class TraceIdModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceIdMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
