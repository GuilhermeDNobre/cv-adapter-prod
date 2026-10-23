import { describe, expect, it, vi } from 'vitest';
import { ResumeExportRepository } from './resume-export.repository';
import type { Database } from '../database/database.provider';

function makeDatabase(insertRows: Array<{ id: string }>, selectRows: unknown[]) {
  const returning = vi.fn(async () => insertRows);
  const values = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values }));
  const where = vi.fn(async () => selectRows);
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin }));
  const select = vi.fn(() => ({ from }));
  const database = { insert, select } as unknown as Database;
  return { database, insert, values, returning, select, from, innerJoin, where };
}

describe('ResumeExportRepository.createExport', () => {
  it('should insert the pdf with its page count and return the id', async () => {
    const { database, insert } = makeDatabase([{ id: 'export-id' }], []);
    const repository = new ResumeExportRepository(database);
    const pdf = Buffer.from('pdf-bytes');

    await expect(repository.createExport({ resumeId: 'resume-id', pdf, pageCount: 2 })).resolves.toBe(
      'export-id',
    );
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('should throw when no row is returned', async () => {
    const { database } = makeDatabase([], []);
    const repository = new ResumeExportRepository(database);

    await expect(
      repository.createExport({ resumeId: 'resume-id', pdf: Buffer.from('x'), pageCount: 1 }),
    ).rejects.toThrow('Failed to create resume export');
  });
});

describe('ResumeExportRepository.findOwnedExport', () => {
  it('should return the owned export with its pdf bytes', async () => {
    const row = {
      id: 'export-id',
      resumeId: 'resume-id',
      resumeName: 'Backend focus',
      pdf: Buffer.from('pdf-bytes'),
      pageCount: 1,
      createdAt: new Date(),
    };
    const { database } = makeDatabase([], [row]);
    const repository = new ResumeExportRepository(database);

    await expect(repository.findOwnedExport({ exportId: 'export-id', userId: 'user-id' })).resolves.toEqual(
      row,
    );
  });

  it('should return undefined when the export belongs to someone else', async () => {
    const { database } = makeDatabase([], []);
    const repository = new ResumeExportRepository(database);

    await expect(repository.findOwnedExport({ exportId: 'export-id', userId: 'other' })).resolves.toBeUndefined();
  });
});
