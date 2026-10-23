import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { EvaluationResponse } from 'schema/contracts/evaluation';
import { ApiError, NetworkError, getEvaluation } from '../lib/api-client';
import { useEvaluationStatus } from './use-evaluation-status';

vi.mock('../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api-client')>();
  return { ...actual, getEvaluation: vi.fn() };
});

const mockedGetEvaluation = vi.mocked(getEvaluation);

const EVALUATION_ID = '3f2a7c5b-8d4e-4f6a-9b0c-1d2e3f4a5b6c';
const POLL_INTERVAL_MS = 1500;

function evaluationFixture(status: EvaluationResponse['status']): EvaluationResponse {
  return {
    id: EVALUATION_ID,
    status,
    matchScore: status === 'ready' ? 62 : null,
    failureReason: null,
    resumeId: null,
    requirementCoverages: status === 'ready' ? [] : [],
    createdAt: '2026-09-05T10:00:00.000Z',
    updatedAt: '2026-09-05T10:00:00.000Z',
  };
}

async function flushPromises(): Promise<void> {
  await act(async () => {});
}

async function advanceTimers(milliseconds: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

function renderStatus(id: string | null) {
  return renderHook(() => useEvaluationStatus(id));
}

describe('useEvaluationStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    mockedGetEvaluation.mockReset();
  });

  it('should not query the API while there is no evaluation id', async () => {
    const { result } = renderStatus(null);
    await flushPromises();

    expect(mockedGetEvaluation).not.toHaveBeenCalled();
    expect(result.current.evaluation).toBeNull();
  });

  it('should fetch the evaluation as soon as an id is given', async () => {
    mockedGetEvaluation.mockResolvedValue(evaluationFixture('queued'));

    const { result } = renderStatus(EVALUATION_ID);
    await flushPromises();

    expect(mockedGetEvaluation).toHaveBeenCalledWith(EVALUATION_ID);
    expect(result.current.evaluation?.status).toBe('queued');
  });

  it('should keep polling while the status is intermediate', async () => {
    mockedGetEvaluation.mockResolvedValue(evaluationFixture('analyzing'));

    renderStatus(EVALUATION_ID);
    await flushPromises();
    expect(mockedGetEvaluation).toHaveBeenCalledTimes(1);

    await advanceTimers(POLL_INTERVAL_MS);
    expect(mockedGetEvaluation).toHaveBeenCalledTimes(2);

    await advanceTimers(POLL_INTERVAL_MS);
    expect(mockedGetEvaluation).toHaveBeenCalledTimes(3);
  });

  it('should stop polling when the status reaches ready', async () => {
    mockedGetEvaluation.mockResolvedValue(evaluationFixture('ready'));

    renderStatus(EVALUATION_ID);
    await flushPromises();
    expect(mockedGetEvaluation).toHaveBeenCalledTimes(1);

    await advanceTimers(POLL_INTERVAL_MS * 3);
    expect(mockedGetEvaluation).toHaveBeenCalledTimes(1);
  });

  it('should stop polling when the status reaches failed', async () => {
    mockedGetEvaluation.mockResolvedValue(evaluationFixture('failed'));

    renderStatus(EVALUATION_ID);
    await flushPromises();
    expect(mockedGetEvaluation).toHaveBeenCalledTimes(1);

    await advanceTimers(POLL_INTERVAL_MS * 3);
    expect(mockedGetEvaluation).toHaveBeenCalledTimes(1);
  });

  it('should stop polling when the screen unmounts mid-flight', async () => {
    mockedGetEvaluation.mockResolvedValue(evaluationFixture('queued'));

    const { unmount } = renderStatus(EVALUATION_ID);
    await flushPromises();
    expect(mockedGetEvaluation).toHaveBeenCalledTimes(1);

    unmount();
    await advanceTimers(POLL_INTERVAL_MS * 3);
    expect(mockedGetEvaluation).toHaveBeenCalledTimes(1);
  });

  it('should set not-found and stop when a poll answers 404', async () => {
    mockedGetEvaluation.mockRejectedValue(new ApiError(404, 'Evaluation not found.'));

    const { result } = renderStatus(EVALUATION_ID);
    await flushPromises();

    expect(result.current.pollErrorKind).toBe('not-found');
    await advanceTimers(POLL_INTERVAL_MS * 3);
    expect(mockedGetEvaluation).toHaveBeenCalledTimes(1);
  });

  it('should keep polling when a blip is not a fatal status', async () => {
    mockedGetEvaluation
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValue(evaluationFixture('queued'));

    const { result } = renderStatus(EVALUATION_ID);
    await flushPromises();
    expect(result.current.pollErrorKind).toBeNull();

    await advanceTimers(POLL_INTERVAL_MS);
    expect(mockedGetEvaluation).toHaveBeenCalledTimes(2);
    expect(result.current.evaluation?.status).toBe('queued');
  });

  it('should re-read a terminal evaluation once when refresh runs, without resuming polling', async () => {
    mockedGetEvaluation.mockResolvedValue(evaluationFixture('ready'));

    const { result } = renderStatus(EVALUATION_ID);
    await flushPromises();
    expect(mockedGetEvaluation).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.refresh();
    });
    await flushPromises();
    expect(mockedGetEvaluation).toHaveBeenCalledTimes(2);

    await advanceTimers(POLL_INTERVAL_MS * 3);
    expect(mockedGetEvaluation).toHaveBeenCalledTimes(2);
  });
});
