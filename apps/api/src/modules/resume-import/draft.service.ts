import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { resumeImports } from 'schema';
import {
  resumeImportDraftSchema,
  resumeImportIdSchema,
  resumeImportResponseSchema,
  type ResumeImportDraft,
  type ResumeImportResponse,
} from 'schema/contracts/resume-import';
import { DATABASE, type Database } from '../database/database.provider';

const ALLOWED_EDIT_STATUSES = ['ready_for_review'] as const;

function toResponse(row: typeof resumeImports.$inferSelect): ResumeImportResponse {
  return resumeImportResponseSchema.parse({
    id: row.id,
    status: row.status,
    failureReason: row.failureReason,
    draft: row.draft,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

@Injectable()
export class DraftService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async saveDraft(
    resumeImportId: string,
    userId: string,
    draft: ResumeImportDraft,
  ): Promise<ResumeImportResponse> {
    const parsedId = resumeImportIdSchema.safeParse(resumeImportId);
    if (!parsedId.success) {
      throw new NotFoundException('Resume import not found.');
    }
    const parsed = resumeImportDraftSchema.safeParse(draft);
    if (!parsed.success) {
      throw new BadRequestException('Invalid draft format.');
    }
    const [row] = await this.database
      .select()
      .from(resumeImports)
      .where(eq(resumeImports.id, parsedId.data));
    if (row === undefined || row.userId !== userId) {
      throw new NotFoundException('Resume import not found.');
    }
    if (!(ALLOWED_EDIT_STATUSES as readonly string[]).includes(row.status)) {
      throw new ConflictException('Resume import is not in a reviewable state.');
    }
    const [updated] = await this.database
      .update(resumeImports)
      .set({ draft: parsed.data, summary: parsed.data.summary ?? null, updatedAt: new Date() })
      .where(eq(resumeImports.id, parsedId.data))
      .returning();
    if (updated === undefined) {
      throw new Error('Failed to update draft');
    }
    return toResponse(updated);
  }
}
