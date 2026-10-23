import { describe, expect, it, vi } from 'vitest';
import NovoBaseResumePage from './page';

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

async function locationOf(
  params: Record<string, string | string[] | undefined>,
): Promise<string> {
  try {
    await NovoBaseResumePage({ searchParams: Promise.resolve(params) });
  } catch (error: unknown) {
    if (error instanceof simulated.RedirectSignal) return error.location;
    throw error;
  }
  throw new Error('Expected the page to redirect');
}

describe('NovoBaseResumePage redirect', () => {
  it('should redirect to adaptar without a query when none was carried in', async () => {
    await expect(locationOf({})).resolves.toBe('/adaptar');
  });

  it('should preserve vaga and avaliacao in the adaptar query', async () => {
    const vaga = '5e4d3c2b-1a09-4876-9543-21fedcba0987';
    const avaliacao = '3f2a7c5b-8d4e-4f6a-9b0c-1d2e3f4a5b6c';

    await expect(locationOf({ vaga, avaliacao })).resolves.toBe(
      `/adaptar?vaga=${vaga}&avaliacao=${avaliacao}`,
    );
  });

  it('should preserve only vaga when avaliacao is missing', async () => {
    const vaga = '5e4d3c2b-1a09-4876-9543-21fedcba0987';

    await expect(locationOf({ vaga })).resolves.toBe(`/adaptar?vaga=${vaga}`);
  });
});
