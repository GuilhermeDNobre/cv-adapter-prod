import { describe, expect, it } from 'vitest';
import { DEEPSEEK_ACCOUNT } from './deepseek-account.client';
import { DEEPSEEK_KEY_STORE } from './deepseek-key.repository';
import { SettingsController } from './settings.controller';
import { SettingsModule } from './settings.module';
import { SettingsService } from './settings.service';

describe('SettingsModule', () => {
  it('should expose the key store, account client and service', () => {
    const exports: unknown[] = Reflect.getMetadata('exports', SettingsModule);

    expect(exports).toContain(DEEPSEEK_KEY_STORE);
    expect(exports).toContain(DEEPSEEK_ACCOUNT);
    expect(exports).toContain(SettingsService);
  });

  it('should register the settings controller', () => {
    const controllers: unknown[] = Reflect.getMetadata('controllers', SettingsModule);

    expect(controllers).toContain(SettingsController);
  });
});
