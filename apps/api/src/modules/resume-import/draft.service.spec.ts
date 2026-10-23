import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../database/database.provider';
import { DraftService } from './draft.service';

const VALID_UUID = '11111111-1111-4111-8111-111111111111';
const VALID_DRAFT = {
  evidences: [{ statement: 'Led a team of 5 engineers', experienceIndex: 0 }],
  experiences: [
    { company: 'Acme Corp', role: 'Senior Engineer', startedOn: '2020-01-01', endedOn: '2023-12-31' },
  ],
  education: [
    { institution: 'MIT', degree: 'BS Computer Science', startedOn: '2016-09-01', endedOn: '2020-06-01' },
  ],
  contactDetails: { fullName: 'Jane Doe', email: 'jane@example.com', phone: '+5511999999999', city: 'Quixadá, CE', links: [] },
};

function createService(options?: { status?: string }) {
  const status = options?.status ?? 'ready_for_review';
  const now = new Date('2026-01-01T00:00:00Z');
  const existingRow = {
    id: VALID_UUID,
    userId: 'user-1',
    storageKey: 'source-documents/user-1/uuid-1',
    status,
    failureReason: null,
    draft: null,
    createdAt: now,
    updatedAt: now,
  };
  const updatedRow = { ...existingRow, draft: VALID_DRAFT, updatedAt: new Date('2026-01-02T00:00:00Z') };
  const selectReturning = vi.fn(async () => [existingRow]);
  const updateReturning = vi.fn(async () => [updatedRow]);
  const database = {
    insert: vi.fn(),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => selectReturning()),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: updateReturning,
        })),
      })),
    })),
  } as unknown as Database;
  const service = new DraftService(database);
  return { service, database, selectReturning, updateReturning, existingRow, updatedRow };
}

describe('DraftService.saveDraft', () => {
  it('should validate the draft against the contract and save it', async () => {
    const { service } = createService();

    const result = await service.saveDraft(VALID_UUID, 'user-1', VALID_DRAFT);

    expect(result.id).toBe(VALID_UUID);
    expect(result.status).toBe('ready_for_review');
    expect(result.draft).toBeDefined();
  });

  it('should reject with 404 for a malformed id', async () => {
    const { service } = createService();

    await expect(service.saveDraft('not-a-uuid', 'user-1', VALID_DRAFT)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should reject with 404 when import does not exist', async () => {
    const { service, selectReturning } = createService();
    selectReturning.mockResolvedValueOnce([]);

    await expect(service.saveDraft(VALID_UUID, 'user-1', VALID_DRAFT)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should reject with 404 when import belongs to another user', async () => {
    const { service } = createService();

    await expect(service.saveDraft(VALID_UUID, 'user-2', VALID_DRAFT)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should reject with 422 when status is not ready_for_review', async () => {
    const { service } = createService({ status: 'confirmed' });

    await expect(service.saveDraft(VALID_UUID, 'user-1', VALID_DRAFT)).rejects.toThrow(
      ConflictException,
    );
  });

  it('should reject with 422 when status is queued', async () => {
    const { service } = createService({ status: 'queued' });

    await expect(service.saveDraft(VALID_UUID, 'user-1', VALID_DRAFT)).rejects.toThrow(
      ConflictException,
    );
  });

  it('should reject with 400 for invalid draft format', async () => {
    const { service } = createService();
    const invalidDraft = { evidences: 'not-an-array' };

    await expect(
      service.saveDraft(VALID_UUID, 'user-1', invalidDraft as unknown as Parameters<typeof service.saveDraft>[2]),
    ).rejects.toThrow(BadRequestException);
  });

  it('should save draft that removes items', async () => {
    const { service } = createService();
    const draftWithRemovals = {
      ...VALID_DRAFT,
      evidences: [],
      experiences: [],
    };

    const result = await service.saveDraft(VALID_UUID, 'user-1', draftWithRemovals);

    expect(result.draft).toBeDefined();
  });

  it('should save draft that adds new items', async () => {
    const { service } = createService();
    const draftWithAdditions = {
      ...VALID_DRAFT,
      evidences: [
        ...VALID_DRAFT.evidences,
        { statement: 'Built CI/CD pipeline', experienceIndex: 0 },
      ],
    };

    const result = await service.saveDraft(VALID_UUID, 'user-1', draftWithAdditions);

    expect(result.draft).toBeDefined();
  });
});
