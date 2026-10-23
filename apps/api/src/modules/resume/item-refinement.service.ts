import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { resumeSectionIdSchema } from 'schema/contracts/resume';
import { AI_CLIENT, type AiClient } from '../ai/ai-client';
import {
  AiBalanceExhaustedError,
  AiError,
  AiKeyMissingError,
  AiKeyRejectedError,
} from '../ai/ai-errors';
import { refineItemOutputSchema } from '../ai/prompts/refine-item';
import { ResumeStructureRepository } from './resume-structure.repository';

const AI_KEY_MISSING_MESSAGE = 'No DeepSeek key is configured. Add a key in settings.';
const AI_KEY_REJECTED_MESSAGE = 'The DeepSeek key was rejected. Replace it in settings.';
const AI_BALANCE_EXHAUSTED_MESSAGE = 'The DeepSeek balance is exhausted. Top up the account to continue.';
const AI_UNAVAILABLE_MESSAGE = 'The item could not be refined right now. Try again in a moment.';

export interface RefineItemRequest {
  readonly userId: string;
  readonly sectionId: string;
  readonly text: string;
}

export interface RefineItemResult {
  readonly refined: string;
}

@Injectable()
export class ItemRefinementService {
  constructor(
    @Inject(AI_CLIENT) private readonly aiClient: AiClient,
    @Inject(ResumeStructureRepository) private readonly structures: ResumeStructureRepository,
  ) {}

  async refine(input: RefineItemRequest): Promise<RefineItemResult> {
    const owned = await this.requireOwnedSection(input.userId, input.sectionId);
    const startedAtMs = Date.now();
    try {
      const averageBulletWords = await this.readAverageBulletWords(owned.section.id);
      const output = await this.aiClient.complete({
        promptName: 'refine-item',
        payload: {
          text: input.text,
          sectionKind: owned.section.kind,
          language: owned.resume.language,
          writingMethod: owned.resume.writingMethod,
          tone: owned.resume.tone,
          ...(averageBulletWords === undefined ? {} : { averageBulletWords }),
        },
        outputSchema: refineItemOutputSchema,
      });
      console.log('item.refinement.completed', {
        sectionId: owned.section.id,
        durationMs: Date.now() - startedAtMs,
      });
      return { refined: output.refined };
    } catch (error: unknown) {
      if (!(error instanceof AiError)) {
        throw error;
      }
      const durationMs = Date.now() - startedAtMs;
      if (error instanceof AiKeyMissingError) {
        console.error('item.refinement.failed', { sectionId: owned.section.id, durationMs, reason: 'ai_key_missing' });
        throw new UnprocessableEntityException({ code: 'ai_key_missing', message: AI_KEY_MISSING_MESSAGE });
      }
      if (error instanceof AiKeyRejectedError) {
        console.error('item.refinement.failed', { sectionId: owned.section.id, durationMs, reason: 'ai_key_rejected' });
        throw new UnprocessableEntityException({ code: 'ai_key_rejected', message: AI_KEY_REJECTED_MESSAGE });
      }
      if (error instanceof AiBalanceExhaustedError) {
        console.error('item.refinement.failed', { sectionId: owned.section.id, durationMs, reason: 'ai_balance_exhausted' });
        throw new UnprocessableEntityException({ code: 'ai_balance_exhausted', message: AI_BALANCE_EXHAUSTED_MESSAGE });
      }
      console.error('item.refinement.failed', { sectionId: owned.section.id, durationMs, reason: 'ai_unavailable' });
      throw new ServiceUnavailableException({ code: 'ai_unavailable', message: AI_UNAVAILABLE_MESSAGE });
    }
  }

  private async requireOwnedSection(userId: string, sectionId: string) {
    const parsed = resumeSectionIdSchema.safeParse(sectionId);
    if (!parsed.success) {
      throw new NotFoundException('Section not found.');
    }
    const owned = await this.structures.findOwnedSection(userId, parsed.data);
    if (owned === undefined) {
      throw new NotFoundException('Section not found.');
    }
    return owned;
  }

  private async readAverageBulletWords(sectionId: string): Promise<number | undefined> {
    const entries = await this.structures.listSectionEntries(sectionId);
    const counts: number[] = [];
    for (const entry of entries) {
      const bullets = await this.structures.listEntryBullets(entry.id);
      for (const bullet of bullets) {
        counts.push(countWords(bullet.text));
      }
    }
    if (counts.length === 0) {
      return undefined;
    }
    const total = counts.reduce((sum, count) => sum + count, 0);
    const average = Math.round(total / counts.length);
    return average >= 1 ? average : undefined;
  }
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter((word) => word.length > 0).length;
}
