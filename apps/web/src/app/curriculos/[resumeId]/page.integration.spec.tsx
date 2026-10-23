import { describe, expect, it, vi } from 'vitest';
import ResumeEditorPage from './page';

const simulated = vi.hoisted(() => {
  class RedirectSignal extends Error {
    readonly location: string;

    constructor(location: string) {
      super(`NEXT_REDIRECT: ${location}`);
      this.name = 'RedirectSignal';
      this.location = location;
    }
  }
  return { RedirectSignal };
});

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string): never => {
    throw new simulated.RedirectSignal(url);
  }),
}));

const RESUME_ID = '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01';

async function locationOf(
  params: Record<string, string | string[] | undefined>,
): Promise<string> {
  try {
    await ResumeEditorPage({
      params: Promise.resolve({ resumeId: RESUME_ID }),
      searchParams: Promise.resolve(params),
    });
  } catch (error: unknown) {
    if (error instanceof simulated.RedirectSignal) return error.location;
    throw error;
  }
  throw new Error('Expected the page to redirect');
}

describe('Resume editor redirect against the wizard route', () => {
  it('should redirect to revisar preserving the wizard query', async () => {
    const vaga = '5e4d3c2b-1a09-4876-9543-21fedcba0987';
    const avaliacao = '3f2a7c5b-8d4e-4f6a-9b0c-1d2e3f4a5b6c';

    await expect(locationOf({ vaga, avaliacao })).resolves.toBe(
      `/revisar/${RESUME_ID}?vaga=${vaga}&avaliacao=${avaliacao}`,
    );
  });

  it('should redirect bare revisar when no query was carried in', async () => {
    await expect(locationOf({})).resolves.toBe(`/revisar/${RESUME_ID}`);
  });
});
