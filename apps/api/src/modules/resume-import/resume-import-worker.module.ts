import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiModule } from '../ai/ai.module';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { RESUME_IMPORT_QUEUE } from '../../queue.module';
import { ResumeImportProcessor } from './resume-import.processor';
import { DOCUMENT_EXTRACTOR, DocumentExtractorDispatcher } from './document-extractor';
import { PdfDocumentExtractor } from './pdf-document-extractor';
import { LatexDocumentExtractor } from './latex-document-extractor';
import { HtmlDocumentExtractor } from './html-document-extractor';

// The processor lives here and NOT in ResumeImportModule, so only main.worker.ts
// consumes the queue. Registering it beside the controller put a PDF parser on the
// HTTP process's event loop, which is the exact thing the two-entrypoint split in the
// techspec exists to prevent, and it made HTTP integration specs race the worker for
// jobs on the shared Redis.
@Module({
  imports: [
    DatabaseModule,
    StorageModule,
    AiModule,
    BullModule.registerQueue({ name: RESUME_IMPORT_QUEUE }),
  ],
  providers: [
    ResumeImportProcessor,
    {
      provide: DOCUMENT_EXTRACTOR,
      useFactory: () =>
        new DocumentExtractorDispatcher({
          pdf: new PdfDocumentExtractor(),
          latex: new LatexDocumentExtractor(),
          html: new HtmlDocumentExtractor(),
        }),
    },
  ],
})
export class ResumeImportWorkerModule {}
