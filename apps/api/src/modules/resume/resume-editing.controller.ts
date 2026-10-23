import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  type PipeTransform,
} from '@nestjs/common';
import { LOCAL_USER_ID } from 'schema/local-user';
import {
  createSectionCommentRequestSchema,
  sectionRewriteRequestSchema,
  updateBulletRequestSchema,
  type CreateSectionCommentRequest,
  type ResumeDocumentResponse,
  type SectionRewriteRequest,
  type UpdateBulletRequest,
} from 'schema/contracts/resume';
import { ResumeEditingService } from './resume-editing.service';

export class UpdateBulletPipe implements PipeTransform<unknown, UpdateBulletRequest> {
  transform(value: unknown): UpdateBulletRequest {
    const result = updateBulletRequestSchema.safeParse(value);
    if (!result.success) {
      const [issue] = result.error.issues;
      throw new BadRequestException(issue === undefined ? 'Invalid request body.' : issue.message);
    }
    return result.data;
  }
}

export class CreateSectionCommentPipe implements PipeTransform<unknown, CreateSectionCommentRequest> {
  transform(value: unknown): CreateSectionCommentRequest {
    const result = createSectionCommentRequestSchema.safeParse(value);
    if (!result.success) {
      const [issue] = result.error.issues;
      throw new BadRequestException(issue === undefined ? 'Invalid request body.' : issue.message);
    }
    return result.data;
  }
}

export class SectionRewritePipe implements PipeTransform<unknown, SectionRewriteRequest> {
  transform(value: unknown): SectionRewriteRequest {
    const result = sectionRewriteRequestSchema.safeParse(value);
    if (!result.success) {
      const [issue] = result.error.issues;
      throw new BadRequestException(issue === undefined ? 'Invalid request body.' : issue.message);
    }
    return result.data;
  }
}

@Controller()
export class ResumeEditingController {
  constructor(@Inject(ResumeEditingService) private readonly editing: ResumeEditingService) {}

  @Put('bullets/:bulletId')
  @HttpCode(HttpStatus.OK)
  updateBullet(
    @Param('bulletId') bulletId: string,
    @Body(new UpdateBulletPipe()) body: UpdateBulletRequest,
  ): Promise<ResumeDocumentResponse> {
    return this.editing.updateBullet(LOCAL_USER_ID, bulletId, body);
  }

  @Post('sections/:sectionId/comments')
  @HttpCode(HttpStatus.CREATED)
  createSectionComment(
    @Param('sectionId') sectionId: string,
    @Body(new CreateSectionCommentPipe()) body: CreateSectionCommentRequest,
  ): Promise<ResumeDocumentResponse> {
    return this.editing.createSectionComment(LOCAL_USER_ID, sectionId, body);
  }

  @Post('comments/:commentId/resolve')
  @HttpCode(HttpStatus.OK)
  resolveSectionComment(@Param('commentId') commentId: string): Promise<ResumeDocumentResponse> {
    return this.editing.resolveSectionComment(LOCAL_USER_ID, commentId);
  }

  @Post('sections/:sectionId/rewrite')
  @HttpCode(HttpStatus.ACCEPTED)
  requestSectionRewrite(
    @Param('sectionId') sectionId: string,
    @Body(new SectionRewritePipe()) body: SectionRewriteRequest,
  ): Promise<ResumeDocumentResponse> {
    return this.editing.requestSectionRewrite(LOCAL_USER_ID, sectionId, body.instruction);
  }

  @Post('sections/:sectionId/undo-rewrite')
  @HttpCode(HttpStatus.OK)
  undoSectionRewrite(@Param('sectionId') sectionId: string): Promise<ResumeDocumentResponse> {
    return this.editing.undoSectionRewrite(LOCAL_USER_ID, sectionId);
  }
}
