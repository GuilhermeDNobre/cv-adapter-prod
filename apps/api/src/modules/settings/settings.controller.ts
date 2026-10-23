import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Put,
  type PipeTransform,
} from '@nestjs/common';
import {
  saveDeepSeekKeyRequestSchema,
  type DeepSeekBalance,
  type DeepSeekKeyStatus,
} from 'schema/contracts/settings';
import { SettingsService } from './settings.service';

interface SaveKeyBody {
  readonly apiKey: string;
}

export class SaveDeepSeekKeyPipe implements PipeTransform<unknown, SaveKeyBody> {
  transform(value: unknown): SaveKeyBody {
    const result = saveDeepSeekKeyRequestSchema.safeParse(value);
    if (!result.success) {
      const [issue] = result.error.issues;
      throw new BadRequestException(
        issue === undefined ? 'Invalid request body.' : issue.message,
      );
    }
    return result.data;
  }
}

@Controller('settings')
export class SettingsController {
  constructor(
    @Inject(SettingsService) private readonly settingsService: SettingsService,
  ) {}

  @Get('deepseek-key')
  readKeyStatus(): Promise<DeepSeekKeyStatus> {
    return this.settingsService.getKeyStatus();
  }

  @Put('deepseek-key')
  @HttpCode(HttpStatus.OK)
  saveKey(
    @Body(new SaveDeepSeekKeyPipe()) body: SaveKeyBody,
  ): Promise<{ status: DeepSeekKeyStatus; balance: DeepSeekBalance }> {
    return this.settingsService.saveKey(body.apiKey);
  }

  @Get('deepseek-balance')
  readBalance(): Promise<DeepSeekBalance> {
    return this.settingsService.getBalance();
  }
}
