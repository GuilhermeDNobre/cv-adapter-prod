import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  type PipeTransform,
} from '@nestjs/common';
import {
  dataErasureRequestSchema,
  type DataErasureRequest,
} from 'schema/contracts/data-erasure';
import { DataErasureService } from './data-erasure.service';

export class DataErasurePipe implements PipeTransform<unknown, DataErasureRequest> {
  transform(value: unknown): DataErasureRequest {
    const result = dataErasureRequestSchema.safeParse(value);
    if (!result.success) {
      const [issue] = result.error.issues;
      throw new BadRequestException(issue === undefined ? 'Invalid request body.' : issue.message);
    }
    return result.data;
  }
}

@Controller('data')
export class DataErasureController {
  constructor(
    @Inject(DataErasureService) private readonly dataErasureService: DataErasureService,
  ) {}

  @Post('erase')
  @HttpCode(HttpStatus.OK)
  async eraseData(
    @Body(new DataErasurePipe()) body: DataErasureRequest,
  ): Promise<{ scope: DataErasureRequest['scope'] }> {
    await this.dataErasureService.erase(body.scope);
    return { scope: body.scope };
  }
}
