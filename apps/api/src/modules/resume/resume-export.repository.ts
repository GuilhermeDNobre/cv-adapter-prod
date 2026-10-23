import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { resumeExports, resumes } from 'schema';
import { DATABASE, type Database } from '../database/database.provider';

export interface CreateResumeExportInput {
  readonly resumeId: string;
  readonly pdf: Buffer;
  readonly pageCount: number;
}

export interface OwnedResumeExport {
  readonly id: string;
  readonly resumeId: string;
  readonly resumeName: string;
  readonly pdf: Buffer;
  readonly pageCount: number;
  readonly createdAt: Date;
}

@Injectable()
export class ResumeExportRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async createExport(input: CreateResumeExportInput): Promise<string> {
    const [row] = await this.database
      .insert(resumeExports)
      .values({ resumeId: input.resumeId, pdf: input.pdf, pageCount: input.pageCount })
      .returning({ id: resumeExports.id });
    if (row === undefined) {
      throw new Error('Failed to create resume export');
    }
    return row.id;
  }

  async findOwnedExport(input: { exportId: string; userId: string }): Promise<OwnedResumeExport | undefined> {
    const [row] = await this.database
      .select({
        id: resumeExports.id,
        resumeId: resumeExports.resumeId,
        resumeName: resumes.name,
        pdf: resumeExports.pdf,
        pageCount: resumeExports.pageCount,
        createdAt: resumeExports.createdAt,
      })
      .from(resumeExports)
      .innerJoin(resumes, eq(resumeExports.resumeId, resumes.id))
      .where(and(eq(resumeExports.id, input.exportId), eq(resumes.userId, input.userId)));
    return row;
  }
}
