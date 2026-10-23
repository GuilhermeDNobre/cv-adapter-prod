import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '../database/database.module';
import { AiModule } from '../ai/ai.module';
import { CareerProfileModule } from '../career-profile/career-profile.module';
import { RenderingModule } from '../rendering/rendering.module';
import { RESUME_WRITING_QUEUE } from '../../queue.module';
import { AdaptationReviewController } from './adaptation-review.controller';
import { AdaptationReviewService } from './adaptation-review.service';
import { SkillProposalController } from './skill-proposal.controller';
import { SkillProposalService } from './skill-proposal.service';
import { BaseResumeController } from './base-resume.controller';
import { BaseResumeService } from './base-resume.service';
import { FactCorrectionController } from './fact-correction.controller';
import { FactCorrectionService } from './fact-correction.service';
import { ResumeDocumentRepository } from './resume-document.repository';
import { ResumeEditingController } from './resume-editing.controller';
import { ResumeEditingRepository } from './resume-editing.repository';
import { ResumeEditingService } from './resume-editing.service';
import { ResumeExportController } from './resume-export.controller';
import { ResumeExportRepository } from './resume-export.repository';
import { ResumeExportService } from './resume-export.service';
import { ResumeRepository } from './resume.repository';
import { ResumeReviewService } from './resume-review.service';
import { ResumeService } from './resume.service';
import { ItemRefinementController } from './item-refinement.controller';
import { ItemRefinementService } from './item-refinement.service';
import { ResumeStructureController } from './resume-structure.controller';
import { ResumeStructureRepository } from './resume-structure.repository';
import { ResumeStructureService } from './resume-structure.service';
import { TailoredResumeController } from './tailored-resume.controller';
import { TailoredResumeService } from './tailored-resume.service';

@Module({
  imports: [
    DatabaseModule,
    AiModule,
    CareerProfileModule,
    RenderingModule,
    BullModule.registerQueue({ name: RESUME_WRITING_QUEUE }),
  ],
  controllers: [
    AdaptationReviewController,
    SkillProposalController,
    BaseResumeController,
    TailoredResumeController,
    ResumeEditingController,
    FactCorrectionController,
    ResumeExportController,
    ResumeStructureController,
    ItemRefinementController,
  ],
  providers: [
    ResumeDocumentRepository,
    ResumeRepository,
    ResumeEditingRepository,
    ResumeExportRepository,
    ResumeStructureRepository,
    AdaptationReviewService,
    SkillProposalService,
    BaseResumeService,
    ResumeService,
    TailoredResumeService,
    ResumeEditingService,
    ResumeReviewService,
    ResumeExportService,
    ResumeStructureService,
    ItemRefinementService,
    FactCorrectionService,
  ],
  exports: [ResumeRepository, BaseResumeService, ResumeService, TailoredResumeService],
})
export class ResumeModule {}
