import { test, expect, type Page } from '@playwright/test';
import {
  waitForResumeImport,
  waitForResumeReady,
  waitForEvaluationReady,
  waitForBaseResumeProposal,
} from './helpers';

interface MockReply {
  readonly ok: boolean;
  readonly payload: unknown;
}

function fakePage(sequence: MockReply[], calls: { count: number }): Page {
  const get = async (): Promise<{ ok: () => boolean; json: () => Promise<unknown> }> => {
    const item = sequence[Math.min(calls.count, sequence.length - 1)];
    calls.count += 1;
    return {
      ok: () => item?.ok ?? false,
      json: () => Promise.resolve(item?.payload),
    };
  };
  return { request: { get } } as unknown as Page;
}

test.describe('wait helpers poll until done', () => {
  test('waitForResumeImport waits through pending states until ready', async () => {
    const calls = { count: 0 };
    const page = fakePage(
      [
        { ok: false, payload: null },
        { ok: true, payload: { status: 'extracting', draft: null, failureReason: null } },
        { ok: true, payload: { status: 'ready_for_review', draft: {}, failureReason: null } },
        { ok: true, payload: { status: 'ready_for_review', draft: {}, failureReason: null } },
      ],
      calls,
    );
    await waitForResumeImport(page, 'any-id');
    expect(calls.count).toBeGreaterThan(2);
  });

  test('waitForResumeReady waits through generating until ready', async () => {
    const calls = { count: 0 };
    const page = fakePage(
      [
        { ok: false, payload: null },
        { ok: true, payload: { generationStatus: 'generating', failureReason: null } },
        { ok: true, payload: { generationStatus: 'ready', failureReason: null } },
        { ok: true, payload: { generationStatus: 'ready', failureReason: null } },
      ],
      calls,
    );
    await waitForResumeReady(page, 'any-id');
    expect(calls.count).toBeGreaterThan(2);
  });

  test('waitForEvaluationReady waits through running until ready', async () => {
    const calls = { count: 0 };
    const page = fakePage(
      [
        { ok: false, payload: null },
        { ok: true, payload: { status: 'running' } },
        { ok: true, payload: { status: 'ready' } },
        { ok: true, payload: { status: 'ready' } },
      ],
      calls,
    );
    await waitForEvaluationReady(page, 'any-id');
    expect(calls.count).toBeGreaterThan(2);
  });

  test('waitForResumeImport throws with the failure reason', async () => {
    const calls = { count: 0 };
    const page = fakePage(
      [
        { ok: true, payload: { status: 'extracting', draft: null, failureReason: null } },
        { ok: true, payload: { status: 'failed', draft: null, failureReason: 'boom' } },
        { ok: true, payload: { status: 'failed', draft: null, failureReason: 'boom' } },
      ],
      calls,
    );
    await expect(waitForResumeImport(page, 'any-id')).rejects.toThrow('Resume import failed: boom');
    expect(calls.count).toBeGreaterThan(2);
  });

  test('waitForResumeReady throws with the failure reason', async () => {
    const calls = { count: 0 };
    const page = fakePage(
      [
        { ok: true, payload: { generationStatus: 'generating', failureReason: null } },
        { ok: true, payload: { generationStatus: 'failed', failureReason: 'boom' } },
        { ok: true, payload: { generationStatus: 'failed', failureReason: 'boom' } },
      ],
      calls,
    );
    await expect(waitForResumeReady(page, 'any-id')).rejects.toThrow('Resume generation failed: boom');
    expect(calls.count).toBeGreaterThan(2);
  });

  test('waitForEvaluationReady throws on failed', async () => {
    const calls = { count: 0 };
    const page = fakePage(
      [
        { ok: true, payload: { status: 'running' } },
        { ok: true, payload: { status: 'failed' } },
        { ok: true, payload: { status: 'failed' } },
      ],
      calls,
    );
    await expect(waitForEvaluationReady(page, 'any-id')).rejects.toThrow('Evaluation failed');
    expect(calls.count).toBeGreaterThan(2);
  });

  test('waitForBaseResumeProposal waits through generating until ready', async () => {
    const calls = { count: 0 };
    const page = fakePage(
      [
        { ok: false, payload: null },
        { ok: true, payload: { status: 'generating', proposal: null, failureReason: null } },
        { ok: true, payload: { status: 'ready', proposal: {}, failureReason: null } },
        { ok: true, payload: { status: 'ready', proposal: {}, failureReason: null } },
      ],
      calls,
    );
    await waitForBaseResumeProposal(page, 'any-id');
    expect(calls.count).toBeGreaterThan(2);
  });

  test('waitForBaseResumeProposal throws with the failure reason', async () => {
    const calls = { count: 0 };
    const page = fakePage(
      [
        { ok: true, payload: { status: 'generating', proposal: null, failureReason: null } },
        { ok: true, payload: { status: 'failed', proposal: null, failureReason: 'boom' } },
        { ok: true, payload: { status: 'failed', proposal: null, failureReason: 'boom' } },
      ],
      calls,
    );
    await expect(waitForBaseResumeProposal(page, 'any-id')).rejects.toThrow('Base resume proposal failed: boom');
    expect(calls.count).toBeGreaterThan(2);
  });
});
