import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  type PipeTransform,
} from '@nestjs/common';
import { z } from 'zod';
import { LOCAL_USER_ID } from 'schema/local-user';
import { ItemRefinementService } from './item-refinement.service';

export const refineItemRequestSchema = z.object({
  text: z.string().trim().min(1).max(1000),
});

export type RefineItemRequestBody = z.infer<typeof refineItemRequestSchema>;

export class RefineItemPipe implements PipeTransform<unknown, RefineItemRequestBody> {
  transform(value: unknown): RefineItemRequestBody {
    const result = refineItemRequestSchema.safeParse(value);
    if (!result.success) {
      const [issue] = result.error.issues;
      throw new BadRequestException(issue === undefined ? 'Invalid request body.' : issue.message);
    }
    return result.data;
  }
}

@Controller()
export class ItemRefinementController {
  constructor(@Inject(ItemRefinementService) private readonly refinement: ItemRefinementService) {}

  @Post('sections/:sectionId/refine-item')
  @HttpCode(HttpStatus.OK)
  async refineItem(
    @Param('sectionId') sectionId: string,
    @Body(new RefineItemPipe()) body: RefineItemRequestBody,
  ): Promise<{ refined: string }> {
    return this.refinement.refine({ userId: LOCAL_USER_ID, sectionId, text: body.text });
  }
}
