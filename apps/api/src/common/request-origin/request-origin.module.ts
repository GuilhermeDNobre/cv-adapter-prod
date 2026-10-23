import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LocalRequestGuard } from './local-request.guard';

@Module({
  providers: [{ provide: APP_GUARD, useClass: LocalRequestGuard }],
})
export class RequestOriginModule {}
