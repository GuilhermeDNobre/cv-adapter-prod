import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class AppController {
  @Get()
  check(): { status: string } {
    return { status: 'ok' };
  }
}
