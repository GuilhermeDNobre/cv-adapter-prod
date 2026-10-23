import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Browser } from 'playwright-core';
import { PlaywrightPdfRenderer } from './playwright-pdf-renderer';

const launchMock = vi.hoisted(() => vi.fn());

vi.mock('playwright-core', () => ({
  chromium: { launch: launchMock },
}));

function makePage() {
  return {
    route: vi.fn(async () => undefined),
    setDefaultTimeout: vi.fn(),
    setContent: vi.fn(async () => undefined),
    addScriptTag: vi.fn(async () => undefined),
    evaluate: vi.fn(async () => 2),
    pdf: vi.fn(async () => Buffer.from('pdf-bytes')),
  };
}

function makeBrowser(): { browser: Browser; close: ReturnType<typeof vi.fn> } {
  const page = makePage();
  const context = {
    newPage: vi.fn(async () => page),
    close: vi.fn(async () => undefined),
  };
  const close = vi.fn(async () => undefined);
  const browser = {
    newContext: vi.fn(async () => context),
    close,
    on: vi.fn(),
  } as unknown as Browser;
  return { browser, close };
}

beforeEach(() => {
  launchMock.mockReset();
});

describe('PlaywrightPdfRenderer failed launch', () => {
  it('should retry the launch when the first launch rejects and succeed on the second render', async () => {
    const { browser } = makeBrowser();
    launchMock.mockRejectedValueOnce(new Error('chromium down'));
    launchMock.mockResolvedValue(browser);
    const renderer = new PlaywrightPdfRenderer();

    await expect(renderer.render('<html></html>')).rejects.toThrow('chromium down');
    expect(launchMock).toHaveBeenCalledTimes(1);

    const result = await renderer.render('<html></html>');

    expect(launchMock).toHaveBeenCalledTimes(2);
    expect(result.pageCount).toBe(2);
    expect(result.pdf).toBeInstanceOf(Buffer);
    await renderer.onModuleDestroy();
  });

  it('should not throw onModuleDestroy when the cached launch failed', async () => {
    launchMock.mockRejectedValue(new Error('chromium down'));
    const renderer = new PlaywrightPdfRenderer();

    await expect(renderer.render('<html></html>')).rejects.toThrow('chromium down');

    await expect(renderer.onModuleDestroy()).resolves.toBeUndefined();
  });
});
