import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CareerProfileModule } from '../career-profile/career-profile.module';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { BASE_RESUME_PROPOSAL_QUEUE, RESUME_IMPORT_QUEUE } from '../../queue.module';
import { BaseResumeProposalModule } from '../resume/proposal/base-resume-proposal.module';
import { ResumeImportController } from './resume-import.controller';
import { ResumeImportService } from './resume-import.service';
import { DraftService } from './draft.service';
import {
  DOCUMENT_EXTRACTOR,
  DocumentExtractorDispatcher,
} from './document-extractor';
import { PdfDocumentExtractor } from './pdf-document-extractor';
import { LatexDocumentExtractor } from './latex-document-extractor';
import { HtmlDocumentExtractor } from './html-document-extractor';

@Module({
  imports: [
    DatabaseModule,
    StorageModule,
    CareerProfileModule,
    BaseResumeProposalModule,
    BullModule.registerQueue({ name: RESUME_IMPORT_QUEUE }),
    BullModule.registerQueue({ name: BASE_RESUME_PROPOSAL_QUEUE }),
  ],
  controllers: [ResumeImportController],
  providers: [
    ResumeImportService,
    DraftService,
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
  exports: [ResumeImportService],
})
export class ResumeImportModule {}
