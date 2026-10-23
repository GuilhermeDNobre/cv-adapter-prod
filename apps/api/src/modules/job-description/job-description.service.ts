import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { jobDescriptions, requirements } from 'schema';
import { LOCAL_USER_ID } from 'schema/local-user';
import type { JobDescriptionResponse } from 'schema/contracts/job-description';
import { jobDescriptionIdSchema } from 'schema/contracts/job-description';
import { AI_CLIENT, type AiClient } from '../ai/ai-client';
import {
  AiBalanceExhaustedError,
  AiError,
  AiKeyMissingError,
  AiKeyRejectedError,
} from '../ai/ai-errors';
import {
  parseJobDescriptionOutputSchema,
  type ParseJobDescriptionOutput,
} from '../ai/prompts/parse-job-description';
import { DATABASE, type Database } from '../database/database.provider';
import {
  toJobDescriptionResponse,
  toRequirementRows,
  type RequirementRow,
} from './requirement-mapping';

const NOT_A_JOB_DESCRIPTION_MESSAGE =
  'The text does not look like a job advertisement. Paste the full text of a real job posting and try again.';
const EMPTY_EXTRACTION_MESSAGE =
  'No requirements were found in this job advertisement. If the posting lists requirements, paste its full text and try again.';
const AI_UNAVAILABLE_MESSAGE =
  'The job description could not be processed right now. Try again in a moment.';
const AI_KEY_MISSING_MESSAGE = 'No DeepSeek key is configured. Add a key in settings.';
const AI_KEY_REJECTED_MESSAGE = 'The DeepSeek key was rejected. Replace it in settings.';
const AI_BALANCE_EXHAUSTED_MESSAGE =
  'The DeepSeek balance is exhausted. Top up the account to continue.';
const NOT_FOUND_MESSAGE = 'Job description not found.';

function singleRow<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error('Expected exactly one row');
  }
  return row;
}

@Injectable()
export class JobDescriptionService {
  constructor(
    @Inject(AI_CLIENT) private readonly aiClient: AiClient,
    @Inject(DATABASE) private readonly database: Database,
  ) {}

  async createJobDescription(text: string): Promise<JobDescriptionResponse> {
    const parsed = await this.parseText(text);
    if (!parsed.isJobDescription) {
      console.log('job_description.rejected', { reason: 'not_a_job_description' });
      throw new UnprocessableEntityException(NOT_A_JOB_DESCRIPTION_MESSAGE);
    }
    const rows = toRequirementRows(parsed.requirements);
    if (rows.length === 0) {
      console.log('job_description.rejected', { reason: 'extraction_empty' });
      throw new UnprocessableEntityException(EMPTY_EXTRACTION_MESSAGE);
    }
    const response = await this.persist({ text, language: parsed.language, rows });
    console.log('job_description.parsed', {
      jobDescriptionId: response.id,
      requirementCount: response.requirements.length,
    });
    return response;
  }

  async getJobDescription(id: string): Promise<JobDescriptionResponse> {
    const parsedId = jobDescriptionIdSchema.safeParse(id);
    if (!parsedId.success) {
      throw new NotFoundException(NOT_FOUND_MESSAGE);
    }
    const [jobDescription] = await this.database
      .select()
      .from(jobDescriptions)
      .where(eq(jobDescriptions.id, parsedId.data));
    if (jobDescription === undefined) {
      throw new NotFoundException(NOT_FOUND_MESSAGE);
    }
    const requirementRows = await this.database
      .select()
      .from(requirements)
      .where(eq(requirements.jobDescriptionId, jobDescription.id))
      .orderBy(asc(requirements.ordinal));
    return toJobDescriptionResponse(jobDescription, requirementRows);
  }

  private async parseText(text: string): Promise<ParseJobDescriptionOutput> {
    try {
      return await this.aiClient.complete({
        promptName: 'parse-job-description',
        payload: { text },
        outputSchema: parseJobDescriptionOutputSchema,
      });
    } catch (error: unknown) {
      if (!(error instanceof AiError)) {
        throw error;
      }
      if (error instanceof AiKeyMissingError) {
        console.error('job_description.rejected', { reason: 'ai_key_missing' });
        throw new UnprocessableEntityException({
          code: 'ai_key_missing',
          message: AI_KEY_MISSING_MESSAGE,
        });
      }
      if (error instanceof AiKeyRejectedError) {
        console.error('job_description.rejected', { reason: 'ai_key_rejected' });
        throw new UnprocessableEntityException({
          code: 'ai_key_rejected',
          message: AI_KEY_REJECTED_MESSAGE,
        });
      }
      if (error instanceof AiBalanceExhaustedError) {
        console.error('job_description.rejected', { reason: 'ai_balance_exhausted' });
        throw new UnprocessableEntityException({
          code: 'ai_balance_exhausted',
          message: AI_BALANCE_EXHAUSTED_MESSAGE,
        });
      }
      console.error('job_description.rejected', { reason: 'ai_unavailable' });
      throw new ServiceUnavailableException({
        code: 'ai_unavailable',
        message: AI_UNAVAILABLE_MESSAGE,
      });
    }
  }

  private persist(params: {
    text: string;
    language: string;
    rows: RequirementRow[];
  }): Promise<JobDescriptionResponse> {
    return this.database.transaction(async (transaction) => {
      const insertedJob = singleRow(
        await transaction
          .insert(jobDescriptions)
          .values({
            userId: LOCAL_USER_ID,
            rawText: params.text,
            language: params.language,
          })
          .returning(),
      );
      const insertedRequirements = await transaction
        .insert(requirements)
        .values(
          params.rows.map((row) => ({
            ...row,
            jobDescriptionId: insertedJob.id,
          })),
        )
        .returning();
      return toJobDescriptionResponse(insertedJob, insertedRequirements);
    });
  }
}
