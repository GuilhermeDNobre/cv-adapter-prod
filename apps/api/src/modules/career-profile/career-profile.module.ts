import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { CareerProfileController } from './career-profile.controller';
import { CareerProfileService } from './career-profile.service';
import { DeniedRequirementService } from './denied-requirement.service';
import { EvidenceCorrectionService } from './evidence-correction.service';

@Module({
  imports: [DatabaseModule, StorageModule],
  controllers: [CareerProfileController],
  providers: [CareerProfileService, DeniedRequirementService, EvidenceCorrectionService],
  exports: [CareerProfileService, DeniedRequirementService, EvidenceCorrectionService],
})
export class CareerProfileModule {}
