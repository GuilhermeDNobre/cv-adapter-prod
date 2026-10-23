import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DEEPSEEK_ACCOUNT, DeepSeekAccountClient } from './deepseek-account.client';
import { DEEPSEEK_KEY_STORE, DeepSeekKeyRepository } from './deepseek-key.repository';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [DatabaseModule],
  controllers: [SettingsController],
  providers: [
    { provide: DEEPSEEK_KEY_STORE, useClass: DeepSeekKeyRepository },
    { provide: DEEPSEEK_ACCOUNT, useClass: DeepSeekAccountClient },
    SettingsService,
  ],
  exports: [DEEPSEEK_KEY_STORE, DEEPSEEK_ACCOUNT, SettingsService],
})
export class SettingsModule {}
