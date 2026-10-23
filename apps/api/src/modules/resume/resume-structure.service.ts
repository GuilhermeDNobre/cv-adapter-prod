import { Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  resumeBulletIdSchema,
  resumeEntryIdSchema,
  resumeSectionIdSchema,
  type AddCustomItemRequest,
  type MoveBulletRequest,
} from 'schema/contracts/resume';
import { ResumeStructureRepository } from './resume-structure.repository';

@Injectable()
export class ResumeStructureService {
  constructor(@Inject(ResumeStructureRepository) private readonly structures: ResumeStructureRepository) {}

  async deleteSection(userId: string, sectionId: string): Promise<string> {
    const owned = await this.requireOwnedSection(userId, sectionId);
    await this.structures.deleteSection(owned.section.id);
    await this.structures.touchResume(owned.resume.id);
    return owned.resume.id;
  }

  async moveBullet(input: { readonly userId: string; readonly bulletId: string; readonly direction: MoveBulletRequest['direction'] }): Promise<string> {
    const owned = await this.requireOwnedBullet(input.userId, input.bulletId);
    const siblings = await this.structures.listEntryBullets(owned.entry.id);
    const index = siblings.findIndex((bullet) => bullet.id === owned.bullet.id);
    const target = input.direction === 'up' ? index - 1 : index + 1;
    const current = siblings[index];
    const neighbor = siblings[target];
    if (index < 0 || current === undefined || neighbor === undefined) {
      throw new UnprocessableEntityException('Bullet is already at the edge.');
    }
    await this.structures.swapBulletOrdinals({
      firstId: current.id,
      firstOrdinal: current.ordinal,
      secondId: neighbor.id,
      secondOrdinal: neighbor.ordinal,
    });
    await this.structures.touchResume(owned.resumeId);
    return owned.resumeId;
  }

  async deleteBullet(userId: string, bulletId: string): Promise<string> {
    const owned = await this.requireOwnedBullet(userId, bulletId);
    await this.structures.deleteBullet(owned.bullet.id);
    await this.structures.touchResume(owned.resumeId);
    return owned.resumeId;
  }

  async addCustomItem(input: { readonly userId: string; readonly sectionId: string; readonly item: AddCustomItemRequest }): Promise<string> {
    const owned = await this.requireOwnedSection(input.userId, input.sectionId);
    if (input.item.entryId !== undefined) {
      return this.addBulletToEntry({ userId: input.userId, sectionId: owned.section.id, resumeId: owned.resume.id, item: input.item });
    }
    if (input.item.createEvidence === true) {
      return this.addItemWithEvidence({ userId: input.userId, sectionId: owned.section.id, resumeId: owned.resume.id, sectionKind: owned.section.kind, text: input.item.text });
    }
    if (owned.section.kind !== 'custom') {
      throw new UnprocessableEntityException('Only custom sections accept items.');
    }
    await this.structures.createCustomEntry({ sectionId: owned.section.id, heading: input.item.text });
    await this.structures.touchResume(owned.resume.id);
    return owned.resume.id;
  }

  private async addBulletToEntry(input: { readonly userId: string; readonly sectionId: string; readonly resumeId: string; readonly item: AddCustomItemRequest }): Promise<string> {
    const ownedEntry = await this.requireOwnedEntry(input.userId, input.item.entryId as string);
    if (ownedEntry.section.id !== input.sectionId) {
      throw new NotFoundException('Entry not found.');
    }
    const evidenceId = await this.maybeCreateEvidence({
      userId: input.userId,
      createEvidence: input.item.createEvidence === true,
      experienceId: ownedEntry.entry.experienceId,
      statement: input.item.text,
    });
    await this.structures.createBullet({ entryId: ownedEntry.entry.id, text: input.item.text, evidenceId });
    await this.structures.touchResume(input.resumeId);
    return input.resumeId;
  }

  private async addItemWithEvidence(input: { readonly userId: string; readonly sectionId: string; readonly resumeId: string; readonly sectionKind: string; readonly text: string }): Promise<string> {
    const evidenceId = await this.maybeCreateEvidence({ userId: input.userId, createEvidence: true, experienceId: null, statement: input.text });
    const heading = input.sectionKind === 'custom' ? input.text : null;
    const entryId = await this.structures.createEntry({ sectionId: input.sectionId, heading });
    await this.structures.createBullet({ entryId, text: input.text, evidenceId });
    await this.structures.touchResume(input.resumeId);
    return input.resumeId;
  }

  private async maybeCreateEvidence(input: { readonly userId: string; readonly createEvidence: boolean; readonly experienceId: string | null; readonly statement: string }): Promise<string | null> {
    if (!input.createEvidence) {
      return null;
    }
    const careerProfileId = await this.structures.findCareerProfileId(input.userId);
    if (careerProfileId === undefined) {
      return null;
    }
    return this.structures.createEvidence({ careerProfileId, experienceId: input.experienceId, statement: input.statement });
  }

  async deleteCustomEntry(userId: string, entryId: string): Promise<string> {
    const owned = await this.requireOwnedEntry(userId, entryId);
    if (owned.section.kind !== 'custom') {
      throw new UnprocessableEntityException('Only custom section entries can be removed.');
    }
    await this.structures.deleteEntry(owned.entry.id);
    await this.structures.touchResume(owned.resumeId);
    return owned.resumeId;
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

  private async requireOwnedBullet(userId: string, bulletId: string) {
    const parsed = resumeBulletIdSchema.safeParse(bulletId);
    if (!parsed.success) {
      throw new NotFoundException('Bullet not found.');
    }
    const owned = await this.structures.findOwnedBullet(userId, parsed.data);
    if (owned === undefined) {
      throw new NotFoundException('Bullet not found.');
    }
    return owned;
  }

  private async requireOwnedEntry(userId: string, entryId: string) {
    const parsed = resumeEntryIdSchema.safeParse(entryId);
    if (!parsed.success) {
      throw new NotFoundException('Entry not found.');
    }
    const owned = await this.structures.findOwnedEntry(userId, parsed.data);
    if (owned === undefined) {
      throw new NotFoundException('Entry not found.');
    }
    return owned;
  }
}
