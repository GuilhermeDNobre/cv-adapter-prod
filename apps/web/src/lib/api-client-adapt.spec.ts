import { afterEach, describe, expect, it, vi } from 'vitest';
import { refineSectionItem } from './api-client-adapt';

const SECTION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('refineSectionItem', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should post the plain text and return the refined version', async () => {
    const body = { refined: 'Led the checkout migration.' };
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requestUrl = String(input);
        requestInit = init;
        return jsonResponse(body, 200);
      }),
    );

    const result = await refineSectionItem(SECTION_ID, { text: 'did checkout stuff' });

    expect(result).toEqual(body);
    expect(requestUrl).toBe(`http://localhost:3001/sections/${SECTION_ID}/refine-item`);
    expect(requestInit?.method).toBe('POST');
    expect(JSON.parse(String(requestInit?.body))).toEqual({ text: 'did checkout stuff' });
  });

  it('should surface a 400 when the text is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ statusCode: 400, message: 'text must not be empty' }, 400),
      ),
    );

    await expect(refineSectionItem(SECTION_ID, { text: '' })).rejects.toMatchObject({
      status: 400,
    });
  });
});
