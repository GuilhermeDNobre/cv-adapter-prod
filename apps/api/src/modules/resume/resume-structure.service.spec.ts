import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ResumeStructureService } from './resume-structure.service';

const USER_ID = '00000000-0000-0000-0000-000000000001';
const SECTION_ID = '22222222-2222-4222-8222-222222222222';
const ENTRY_ID = '33333333-3333-4333-8333-333333333333';
const RESUME_ID = '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01';

function makeStructures(options?: { sectionKind?: string; entrySectionId?: string; experienceId?: string | null; careerProfileId?: string }) {
  const sectionKind = options?.sectionKind ?? 'custom';
  return {
    findOwnedSection: vi.fn().mockResolvedValue({
      section: { id: SECTION_ID, kind: sectionKind },
      resume: { id: RESUME_ID },
    }),
    findOwnedEntry: vi.fn().mockResolvedValue({
      entry: { id: ENTRY_ID, sectionId: options?.entrySectionId ?? SECTION_ID, experienceId: options?.experienceId ?? null },
      section: { id: options?.entrySectionId ?? SECTION_ID },
      resumeId: RESUME_ID,
    }),
    createCustomEntry: vi.fn().mockResolvedValue(ENTRY_ID),
    createEntry: vi.fn().mockResolvedValue(ENTRY_ID),
    createBullet: vi.fn().mockResolvedValue('bullet-id'),
    findCareerProfileId: vi.fn().mockResolvedValue(options?.careerProfileId ?? 'profile-id'),
    createEvidence: vi.fn().mockResolvedValue('evidence-id'),
    touchResume: vi.fn().mockResolvedValue(undefined),
  };
}

describe('ResumeStructureService.addCustomItem', () => {
  it('should keep the legacy custom entry behavior without evidence', async () => {
    const structures = makeStructures({ sectionKind: 'custom' });
    const service = new ResumeStructureService(structures as never);

    const resumeId = await service.addCustomItem({ userId: USER_ID, sectionId: SECTION_ID, item: { text: 'Talk' } });

    expect(resumeId).toBe(RESUME_ID);
    expect(structures.createCustomEntry).toHaveBeenCalledWith({ sectionId: SECTION_ID, heading: 'Talk' });
    expect(structures.createBullet).not.toHaveBeenCalled();
    expect(structures.createEvidence).not.toHaveBeenCalled();
  });

  it('should reject a typed section without new fields with 422', async () => {
    const structures = makeStructures({ sectionKind: 'experience' });
    const service = new ResumeStructureService(structures as never);

    await expect(service.addCustomItem({ userId: USER_ID, sectionId: SECTION_ID, item: { text: 'Nope' } })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('should append a bullet with evidence linked to the entry experience', async () => {
    const structures = makeStructures({ sectionKind: 'experience', experienceId: 'exp-id' });
    const service = new ResumeStructureService(structures as never);

    const resumeId = await service.addCustomItem({
      userId: USER_ID,
      sectionId: SECTION_ID,
      item: { text: 'Shipped checkout.', createEvidence: true, entryId: ENTRY_ID },
    });

    expect(resumeId).toBe(RESUME_ID);
    expect(structures.createEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ experienceId: 'exp-id', statement: 'Shipped checkout.' }),
    );
    expect(structures.createBullet).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: ENTRY_ID, text: 'Shipped checkout.', evidenceId: 'evidence-id' }),
    );
    const bullet = structures.createBullet.mock.calls[0]?.[0] as { evidenceId: string | null };
    expect(bullet.evidenceId).toBe('evidence-id');
  });

  it('should create a bullet without evidence when createEvidence is not set', async () => {
    const structures = makeStructures({ sectionKind: 'experience', experienceId: 'exp-id' });
    const service = new ResumeStructureService(structures as never);

    await service.addCustomItem({ userId: USER_ID, sectionId: SECTION_ID, item: { text: 'Helped.', entryId: ENTRY_ID } });

    expect(structures.createEvidence).not.toHaveBeenCalled();
    expect(structures.createBullet).toHaveBeenCalledWith(expect.objectContaining({ evidenceId: null }));
  });

  it('should answer 404 when the entry belongs to another section', async () => {
    const structures = makeStructures({ sectionKind: 'experience', entrySectionId: '99999999-9999-4999-8999-999999999999' });
    const service = new ResumeStructureService(structures as never);

    await expect(
      service.addCustomItem({ userId: USER_ID, sectionId: SECTION_ID, item: { text: 'Helped.', entryId: ENTRY_ID } }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('should create a new entry with bullet and evidence without experience when no entryId is given', async () => {
    const structures = makeStructures({ sectionKind: 'experience' });
    const service = new ResumeStructureService(structures as never);

    await service.addCustomItem({ userId: USER_ID, sectionId: SECTION_ID, item: { text: 'New fact.', createEvidence: true } });

    expect(structures.createEvidence).toHaveBeenCalledWith(expect.objectContaining({ experienceId: null }));
    expect(structures.createEntry).toHaveBeenCalled();
    expect(structures.createBullet).toHaveBeenCalledWith(expect.objectContaining({ evidenceId: 'evidence-id' }));
  });
});
