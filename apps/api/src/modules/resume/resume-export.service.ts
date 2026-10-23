import { Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { renderResumeHtml, type RenderableResume } from 'resume-templates';
import {
  resumeExportIdSchema,
  resumeIdSchema,
  type ExportResumeResponse,
  type ResumeDocumentResponse,
} from 'schema/contracts/resume';
import { PDF_RENDERER, type PdfRenderer } from '../rendering/pdf-renderer';
import { mapResumeDocument } from './resume-document.mapper';
import { ResumeExportRepository } from './resume-export.repository';
import { ResumeRepository } from './resume.repository';

@Injectable()
export class ResumeExportService {
  constructor(
    @Inject(ResumeRepository) private readonly resumes: ResumeRepository,
    @Inject(ResumeExportRepository) private readonly exports: ResumeExportRepository,
    @Inject(PDF_RENDERER) private readonly renderer: PdfRenderer,
  ) {}

  async exportResume(userId: string, resumeId: string): Promise<ExportResumeResponse> {
    const parsedId = resumeIdSchema.safeParse(resumeId);
    if (!parsedId.success) {
      throw new NotFoundException('Resume not found.');
    }
    const document = await this.resumes.findDocument(parsedId.data, userId);
    if (document === undefined) {
      throw new NotFoundException('Resume not found.');
    }
    if (document.resume.generationStatus === 'generating') {
      throw new UnprocessableEntityException('Resume is still generating.');
    }
    if (document.resume.generationStatus === 'failed') {
      throw new UnprocessableEntityException('Resume generation failed.');
    }
    const details = await this.resumes.findDisplayDetails(userId);
    const response = mapResumeDocument({ document, details });
    const renderable = toRenderableResume(response);
    const html = renderResumeHtml(renderable, {
      template: document.resume.template,
      language: document.resume.language,
      mode: 'print',
    });
    const startedAt = Date.now();
    const rendered = await this.renderHtml({ resumeId: document.resume.id, html, startedAt });
    const exportId = await this.exports.createExport({
      resumeId: document.resume.id,
      pdf: rendered.pdf,
      pageCount: rendered.pageCount,
    });
    console.log('pdf.render.completed', {
      resumeId: document.resume.id,
      pageCount: rendered.pageCount,
      durationMs: Date.now() - startedAt,
    });
    return {
      exportId,
      pageCount: rendered.pageCount,
      exceedsLengthTarget: rendered.pageCount > document.resume.lengthTarget,
    };
  }

  private async renderHtml(input: { resumeId: string; html: string; startedAt: number }) {
    try {
      return await this.renderer.render(input.html);
    } catch (error) {
      console.error('pdf.render.failed', {
        resumeId: input.resumeId,
        pageCount: 0,
        durationMs: Date.now() - input.startedAt,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async downloadExport(userId: string, exportId: string): Promise<{ pdf: Buffer; filename: string }> {
    const parsedId = resumeExportIdSchema.safeParse(exportId);
    if (!parsedId.success) {
      throw new NotFoundException('Export not found.');
    }
    const owned = await this.exports.findOwnedExport({ exportId: parsedId.data, userId });
    if (owned === undefined) {
      throw new NotFoundException('Export not found.');
    }
    return { pdf: owned.pdf, filename: buildExportFilename(owned.resumeName) };
  }
}

function toRenderableResume(document: ResumeDocumentResponse): RenderableResume {
  const sections = [...document.sections]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((section) => ({
      id: section.id,
      kind: section.kind,
      title: section.title ?? undefined,
      entries: [...section.entries]
        .sort((left, right) => left.ordinal - right.ordinal)
        .map((entry) => ({
          company: entry.company ?? undefined,
          role: entry.role ?? entry.degree ?? undefined,
          period: entry.period ?? undefined,
          institution: entry.institution ?? undefined,
          heading: entry.heading ?? undefined,
          bullets: [...entry.bullets]
            .sort((left, right) => left.ordinal - right.ordinal)
            .map((bullet) => ({ text: bullet.text, status: bullet.status })),
        })),
    }));
  return {
    contact: {
      name: document.contact.name,
      email: document.contact.email ?? undefined,
      phone: document.contact.phone ?? undefined,
      city: document.contact.city ?? undefined,
      links: document.contact.links ?? undefined,
    },
    sections,
  };
}

function buildExportFilename(resumeName: string): string {
  const ascii = resumeName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const slug = ascii
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  if (slug === '') {
    return 'curriculo.pdf';
  }
  return `curriculo-${slug}.pdf`;
}
