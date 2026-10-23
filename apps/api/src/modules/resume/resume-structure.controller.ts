import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  type PipeTransform,
} from '@nestjs/common';
import { LOCAL_USER_ID } from 'schema/local-user';
import {
  addCustomItemRequestSchema,
  moveBulletRequestSchema,
  type AddCustomItemRequest,
  type MoveBulletRequest,
  type ResumeDocumentResponse,
} from 'schema/contracts/resume';
import { ResumeStructureService } from './resume-structure.service';
import { ResumeService } from './resume.service';

export class MoveBulletPipe implements PipeTransform<unknown, MoveBulletRequest> {
  transform(value: unknown): MoveBulletRequest {
    const result = moveBulletRequestSchema.safeParse(value);
    if (!result.success) {
      const [issue] = result.error.issues;
      throw new BadRequestException(issue === undefined ? 'Invalid request body.' : issue.message);
    }
    return result.data;
  }
}

export class AddCustomItemPipe implements PipeTransform<unknown, AddCustomItemRequest> {
  transform(value: unknown): AddCustomItemRequest {
    const result = addCustomItemRequestSchema.safeParse(value);
    if (!result.success) {
      const [issue] = result.error.issues;
      throw new BadRequestException(issue === undefined ? 'Invalid request body.' : issue.message);
    }
    return result.data;
  }
}

@Controller()
export class ResumeStructureController {
  constructor(
    @Inject(ResumeStructureService) private readonly structures: ResumeStructureService,
    @Inject(ResumeService) private readonly resumes: ResumeService,
  ) {}

  @Delete('sections/:sectionId')
  @HttpCode(HttpStatus.OK)
  async deleteSection(@Param('sectionId') sectionId: string): Promise<ResumeDocumentResponse> {
    const resumeId = await this.structures.deleteSection(LOCAL_USER_ID, sectionId);
    return this.resumes.getResume(resumeId, LOCAL_USER_ID);
  }

  @Post('bullets/:bulletId/move')
  @HttpCode(HttpStatus.OK)
  async moveBullet(
    @Param('bulletId') bulletId: string,
    @Body(new MoveBulletPipe()) body: MoveBulletRequest,
  ): Promise<ResumeDocumentResponse> {
    const resumeId = await this.structures.moveBullet({ userId: LOCAL_USER_ID, bulletId, direction: body.direction });
    return this.resumes.getResume(resumeId, LOCAL_USER_ID);
  }

  @Delete('bullets/:bulletId')
  @HttpCode(HttpStatus.OK)
  async deleteBullet(@Param('bulletId') bulletId: string): Promise<ResumeDocumentResponse> {
    const resumeId = await this.structures.deleteBullet(LOCAL_USER_ID, bulletId);
    return this.resumes.getResume(resumeId, LOCAL_USER_ID);
  }

  @Post('sections/:sectionId/items')
  @HttpCode(HttpStatus.OK)
  async addCustomItem(
    @Param('sectionId') sectionId: string,
    @Body(new AddCustomItemPipe()) body: AddCustomItemRequest,
  ): Promise<ResumeDocumentResponse> {
    const resumeId = await this.structures.addCustomItem({ userId: LOCAL_USER_ID, sectionId, item: body });
    return this.resumes.getResume(resumeId, LOCAL_USER_ID);
  }

  @Delete('entries/:entryId')
  @HttpCode(HttpStatus.OK)
  async deleteCustomEntry(@Param('entryId') entryId: string): Promise<ResumeDocumentResponse> {
    const resumeId = await this.structures.deleteCustomEntry(LOCAL_USER_ID, entryId);
    return this.resumes.getResume(resumeId, LOCAL_USER_ID);
  }
}
