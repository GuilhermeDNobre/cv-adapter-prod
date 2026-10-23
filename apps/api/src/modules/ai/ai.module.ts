import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SettingsModule } from '../settings/settings.module';
import { AI_CLIENT } from './ai-client';
import { DeepSeekClient } from './deepseek-client';
import { AI_RETRY_DELAY_MS, MAX_AI_RETRIES, RetryingAiClient } from './retrying-ai-client';

@Module({
  imports: [DatabaseModule, SettingsModule],
  providers: [
    DeepSeekClient,
    {
      provide: AI_CLIENT,
      useFactory: (inner: DeepSeekClient) =>
        new RetryingAiClient(inner, { maxRetries: MAX_AI_RETRIES, delayMs: AI_RETRY_DELAY_MS }),
      inject: [DeepSeekClient],
    },
  ],
  exports: [AI_CLIENT],
})
export class AiModule {}
