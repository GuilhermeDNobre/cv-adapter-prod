import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ResumeImportResponse } from 'schema/contracts/resume-import';
import { ApiError, getResumeImport, NetworkError } from '../lib/api-client';
import { useResumeImportStatus } from './use-resume-import-status';

vi.mock('../lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api-client')>();
  return { ...actual, getResumeImport: vi.fn() };
});

const mockedGetResumeImport = vi.mocked(getResumeImport);

const IMPORT_ID = '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01';
const POLL_INTERVAL_MS = 1500;

function importFixture(
  status: ResumeImportResponse['status'],
  failureReason: ResumeImportResponse['failureReason'] = null,
): ResumeImportResponse {
  return {
    id: IMPORT_ID,
    status,
    failureReason,
    draft: null,
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
  return renderHook(() => useResumeImportStatus(id));
}

describe('useResumeImportStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    mockedGetResumeImport.mockReset();
  });

  it('should not query the API while there is no import id', async () => {
    const { result } = renderStatus(null);
    await flushPromises();

    expect(mockedGetResumeImport).not.toHaveBeenCalled();
    expect(result.current.resumeImport).toBeNull();
  });

  it('should fetch the import as soon as an id is given', async () => {
    mockedGetResumeImport.mockResolvedValue(importFixture('queued'));

    const { result } = renderStatus(IMPORT_ID);
    await flushPromises();

    expect(mockedGetResumeImport).toHaveBeenCalledWith(IMPORT_ID);
    expect(result.current.resumeImport?.status).toBe('queued');
  });

  it('should keep polling while the status is intermediate', async () => {
    mockedGetResumeImport.mockResolvedValue(importFixture('extracting'));

    renderStatus(IMPORT_ID);
    await flushPromises();
    expect(mockedGetResumeImport).toHaveBeenCalledTimes(1);

    await advanceTimers(POLL_INTERVAL_MS - 1);
    expect(mockedGetResumeImport).toHaveBeenCalledTimes(1);

    await advanceTimers(1);
    expect(mockedGetResumeImport).toHaveBeenCalledTimes(2);

    await advanceTimers(POLL_INTERVAL_MS);
    expect(mockedGetResumeImport).toHaveBeenCalledTimes(3);
  });

  it('should stop polling once the status is ready_for_review', async () => {
    mockedGetResumeImport.mockResolvedValue(importFixture('ready_for_review'));

    renderStatus(IMPORT_ID);
    await flushPromises();
    await advanceTimers(POLL_INTERVAL_MS * 3);

    expect(mockedGetResumeImport).toHaveBeenCalledTimes(1);
  });

  it('should stop polling once the status is confirmed', async () => {
    mockedGetResumeImport.mockResolvedValue(importFixture('confirmed'));

    renderStatus(IMPORT_ID);
    await flushPromises();
    await advanceTimers(POLL_INTERVAL_MS * 3);

    expect(mockedGetResumeImport).toHaveBeenCalledTimes(1);
  });

  it('should stop polling once the status is failed', async () => {
    mockedGetResumeImport.mockResolvedValue(importFixture('failed', 'no_text_layer'));

    const { result } = renderStatus(IMPORT_ID);
    await flushPromises();
    await advanceTimers(POLL_INTERVAL_MS * 3);

    expect(mockedGetResumeImport).toHaveBeenCalledTimes(1);
    expect(result.current.resumeImport?.failureReason).toBe('no_text_layer');
  });

  it('should stop polling when the component unmounts', async () => {
    mockedGetResumeImport.mockResolvedValue(importFixture('queued'));

    const { unmount } = renderStatus(IMPORT_ID);
    await flushPromises();
    await advanceTimers(POLL_INTERVAL_MS);
    expect(mockedGetResumeImport).toHaveBeenCalledTimes(2);

    unmount();
    await advanceTimers(POLL_INTERVAL_MS * 3);

    expect(mockedGetResumeImport).toHaveBeenCalledTimes(2);
  });

  it('should ignore a response that arrives after unmount', async () => {
    let resolveImport: (value: ResumeImportResponse) => void = () => undefined;
    mockedGetResumeImport.mockReturnValue(
      new Promise<ResumeImportResponse>((resolve) => {
        resolveImport = resolve;
      }),
    );

    const { result, unmount } = renderStatus(IMPORT_ID);
    unmount();
    resolveImport(importFixture('ready_for_review'));
    await flushPromises();

    expect(result.current.resumeImport).toBeNull();
    expect(result.current.pollErrorKind).toBeNull();
  });

  it('should stop polling and report not found on a 404', async () => {
    mockedGetResumeImport.mockRejectedValue(new ApiError(404, 'Resume import not found.'));

    const { result } = renderStatus(IMPORT_ID);
    await flushPromises();
    await advanceTimers(POLL_INTERVAL_MS * 3);

    expect(mockedGetResumeImport).toHaveBeenCalledTimes(1);
    expect(result.current.pollErrorKind).toBe('not-found');
  });

  it('should keep polling past a transient network failure', async () => {
    mockedGetResumeImport
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValue(importFixture('structuring'));

    const { result } = renderStatus(IMPORT_ID);
    await flushPromises();
    await advanceTimers(POLL_INTERVAL_MS);

    expect(mockedGetResumeImport).toHaveBeenCalledTimes(2);
    expect(result.current.pollErrorKind).toBeNull();
    expect(result.current.resumeImport?.status).toBe('structuring');
  });
});
