import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { careerProfiles, jobDescriptions, resumeImports, resumes } from 'schema';
import type { DataErasureRequest } from 'schema/contracts/data-erasure';
import { LOCAL_USER_ID } from 'schema/local-user';
import { DATABASE, type Database } from '../database/database.provider';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage';
import { EVALUATION_QUEUE, RESUME_IMPORT_QUEUE, RESUME_WRITING_QUEUE } from '../../queue.module';

export type DataErasureScope = DataErasureRequest['scope'];

@Injectable()
export class DataErasureService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(OBJECT_STORAGE) private readonly objectStorage: ObjectStorage,
    @InjectQueue(EVALUATION_QUEUE) private readonly evaluationQueue: Queue,
    @InjectQueue(RESUME_IMPORT_QUEUE) private readonly resumeImportQueue: Queue,
    @InjectQueue(RESUME_WRITING_QUEUE) private readonly writingQueue: Queue,
  ) {}

  async erase(scope: DataErasureScope): Promise<void> {
    if (scope === 'job_descriptions') {
      await this.eraseJobDescriptions();
    } else if (scope === 'career_profile') {
      await this.eraseCareerProfile();
    } else if (scope === 'resumes') {
      await this.eraseResumes();
    } else {
      await this.eraseEverything();
    }
    console.log('data.erased', { scope });
  }

  private async eraseJobDescriptions(): Promise<void> {
    await this.database.transaction(async (tx) => {
      await tx.delete(jobDescriptions).where(eq(jobDescriptions.userId, LOCAL_USER_ID));
    });
    await this.evaluationQueue.drain(true);
  }

  private async eraseResumes(): Promise<void> {
    await this.database.transaction(async (tx) => {
      await tx.delete(resumes).where(eq(resumes.userId, LOCAL_USER_ID));
    });
    await this.writingQueue.drain(true);
  }

  private async eraseCareerProfile(): Promise<void> {
    await this.database.transaction(async (tx) => {
      await tx.delete(resumes).where(eq(resumes.userId, LOCAL_USER_ID));
      await tx.delete(resumeImports).where(eq(resumeImports.userId, LOCAL_USER_ID));
      await tx.delete(careerProfiles).where(eq(careerProfiles.userId, LOCAL_USER_ID));
    });
    await this.objectStorage.removeSourceDocumentsOf(LOCAL_USER_ID);
    await this.evaluationQueue.drain(true);
    await this.resumeImportQueue.drain(true);
    await this.writingQueue.drain(true);
  }

  private async eraseEverything(): Promise<void> {
    await this.database.transaction(async (tx) => {
      await tx.delete(resumes).where(eq(resumes.userId, LOCAL_USER_ID));
      await tx.delete(jobDescriptions).where(eq(jobDescriptions.userId, LOCAL_USER_ID));
      await tx.delete(resumeImports).where(eq(resumeImports.userId, LOCAL_USER_ID));
      await tx.delete(careerProfiles).where(eq(careerProfiles.userId, LOCAL_USER_ID));
    });
    await this.objectStorage.removeSourceDocumentsOf(LOCAL_USER_ID);
    await this.evaluationQueue.drain(true);
    await this.resumeImportQueue.drain(true);
    await this.writingQueue.drain(true);
  }
}
