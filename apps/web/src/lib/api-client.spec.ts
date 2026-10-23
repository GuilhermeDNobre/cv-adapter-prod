import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  acceptSkillProposal,
  addCustomSectionItem,
  ApiError,
  aiErrorCodeOf,
  apiRequest,
  approveSuggestion,
  createBaseResume,
  createEvaluation,
  createResumeSection,
  createSectionComment,
  createTailoredResume,
  deleteCustomSectionEntry,
  deleteResume,
  deleteResumeBullet,
  deleteResumeSection,
  denyGap,
  denySuggestion,
  downloadResumeExport,
  eraseData,
  exportResume,
  getCareerProfile,
  getDeepSeekBalance,
  getDeepSeekKeyStatus,
  getEvaluation,
  getEvaluationByJobDescription,
  getJobDescription,
  getResume,
  getResumeImport,
  InvalidResponseError,
  listResumes,
  moveResumeBullet,
  NetworkError,
  rejectSkillProposal,
  resolveSectionComment,
  reviewAdaptationChange,
  rewriteSection,
  saveDeepSeekKey,
  undenyGap,
  undoAdaptationChange,
  undoSectionRewrite,
  updateBullet,
  updateEvidence,
  updateExperience,
  updateResumeSettings,
  updateResumeStructure,
  uploadSourceDocument,
} from './api-client';

const payloadSchema = z.object({ id: z.string().uuid() });
const payloadFixture = { id: '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01' };

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function postOptions() {
  return {
    path: '/job-descriptions',
    method: 'POST' as const,
    responseSchema: payloadSchema,
    body: { text: 'a job ad' },
  };
}

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should send JSON bodies', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(payloadFixture, 200));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiRequest(postOptions());

    expect(result).toEqual(payloadFixture);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/job-descriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'a job ad' }),
    });
  });

  it('should send GET requests without a body or content type', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(payloadFixture, 200));
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest({ path: '/job-descriptions/x', method: 'GET', responseSchema: payloadSchema });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/job-descriptions/x',
      expect.objectContaining({ method: 'GET', body: undefined }),
    );
  });

  it('should parse a success payload through the given schema', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(payloadFixture, 200)));

    await expect(apiRequest(postOptions())).resolves.toEqual(payloadFixture);
  });

  it('should throw a typed ApiError carrying status and server message on a rejection', async () => {
    const body = { statusCode: 422, message: 'The text does not look like a job advertisement.' };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(body, 422)));

    const promise = apiRequest(postOptions());

    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({
      status: 422,
      serverMessage: 'The text does not look like a job advertisement.',
    });
  });

  it('should extract the first message when the server sends an array', async () => {
    const body = { statusCode: 400, message: ['text must not be empty', 'second issue'] };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(body, 400)));

    await expect(apiRequest(postOptions())).rejects.toMatchObject({
      status: 400,
      serverMessage: 'text must not be empty',
    });
  });

  it('should keep a numeric status when the failure body is unreadable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));

    await expect(apiRequest(postOptions())).rejects.toMatchObject({ status: 503 });
  });

  it('should translate a fetch rejection into NetworkError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );

    await expect(apiRequest(postOptions())).rejects.toBeInstanceOf(NetworkError);
  });

  it('should translate a schema mismatch in a 200 payload into InvalidResponseError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ id: 'not-a-uuid' }, 200)));

    await expect(apiRequest(postOptions())).rejects.toBeInstanceOf(InvalidResponseError);
  });
});

const queuedImport = {
  id: payloadFixture.id,
  status: 'queued',
  failureReason: null,
  draft: null,
  createdAt: '2026-09-05T10:00:00.000Z',
  updatedAt: '2026-09-05T10:00:00.000Z',
};

describe('uploadSourceDocument', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should post the file as multipart form data with no manual content type', async () => {
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input);
      requestInit = init;
      return jsonResponse(queuedImport, 202);
    });
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['%PDF-1.4 resume'], 'curriculo.pdf', { type: 'application/pdf' });

    const result = await uploadSourceDocument(file);

    expect(result.status).toBe('queued');
    expect(result.id).toBe(payloadFixture.id);
    expect(requestUrl).toBe('http://localhost:3001/resume-imports');
    expect(requestInit?.method).toBe('POST');
    expect(requestInit?.body).toBeInstanceOf(FormData);
    const headers = requestInit?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('should carry the file under the field name the API expects', async () => {
    let sentBody: BodyInit | null | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        sentBody = init?.body;
        return jsonResponse(queuedImport, 202);
      }),
    );
    const file = new File(['<html></html>'], 'curriculo.html', { type: 'text/html' });

    await uploadSourceDocument(file);

    expect(sentBody).toBeInstanceOf(FormData);
    const sent = (sentBody as FormData).get('file');
    expect(sent).toBeInstanceOf(File);
    expect((sent as File).name).toBe('curriculo.html');
  });

  it('should surface the synchronous 400 rejection with its server message', async () => {
    const body = {
      statusCode: 400,
      message: 'Unsupported file format. Accepted formats: PDF, LaTeX (.tex), HTML.',
    };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(body, 400)));

    await expect(
      uploadSourceDocument(new File(['xx'], 'arquivo.zip', { type: 'application/zip' })),
    ).rejects.toMatchObject({
      status: 400,
      serverMessage: 'Unsupported file format. Accepted formats: PDF, LaTeX (.tex), HTML.',
    });
  });
});

describe('getResumeImport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should read one import by id and parse the state through the contract', async () => {
    const extracting = { ...queuedImport, status: 'extracting' };
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input);
      requestInit = init;
      return jsonResponse(extracting, 200);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getResumeImport(payloadFixture.id);

    expect(result.status).toBe('extracting');
    expect(requestUrl).toBe(`http://localhost:3001/resume-imports/${payloadFixture.id}`);
    expect(requestInit?.method).toBe('GET');
  });
});

const EVALUATION_ID = '3f2a7c5b-8d4e-4f6a-9b0c-1d2e3f4a5b6c';

function queuedEvaluation() {
  return {
    id: EVALUATION_ID,
    status: 'queued',
    matchScore: null,
    failureReason: null,
    resumeId: null,
    requirementCoverages: [],
    createdAt: '2026-09-05T10:00:00.000Z',
    updatedAt: '2026-09-05T10:00:00.000Z',
  };
}

describe('apiRequest failure payload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should keep the structured body on the ApiError so screens can read business payloads', async () => {
    const businessBody = {
      statusCode: 422,
      message: 'You must have a Career Profile before requesting an evaluation.',
    };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(businessBody, 422)));

    const error = await apiRequest(postOptions()).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).payload).toEqual(businessBody);
  });

  it('should leave the payload undefined when the failure body is unreadable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));

    const error = await apiRequest(postOptions()).catch((thrown: unknown) => thrown);

    expect((error as ApiError).payload).toBeUndefined();
  });
});

describe('createEvaluation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should post the job description id and accept the 202 queued body', async () => {
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input);
      requestInit = init;
      return jsonResponse(queuedEvaluation(), 202);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await createEvaluation(payloadFixture.id);

    expect(result.status).toBe('queued');
    expect(requestUrl).toBe('http://localhost:3001/evaluations');
    expect(requestInit?.method).toBe('POST');
    expect(requestInit?.body).toBe(JSON.stringify({ jobDescriptionId: payloadFixture.id }));
  });
});

describe('getEvaluation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should read one evaluation by id and parse the state through the contract', async () => {
    const analyzing = { ...queuedEvaluation(), status: 'analyzing' };
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input);
      requestInit = init;
      return jsonResponse(analyzing, 200);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getEvaluation(EVALUATION_ID);

    expect(result.status).toBe('analyzing');
    expect(requestUrl).toBe(`http://localhost:3001/evaluations/${EVALUATION_ID}`);
    expect(requestInit?.method).toBe('GET');
  });
});

describe('getEvaluationByJobDescription', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should read the latest evaluation of the job description through the contract', async () => {
    const ready = { ...queuedEvaluation(), status: 'ready', matchScore: 80 };
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requestUrl = String(input);
        requestInit = init;
        return jsonResponse(ready, 200);
      }),
    );

    const result = await getEvaluationByJobDescription(payloadFixture.id);

    expect(result.status).toBe('ready');
    expect(requestUrl).toBe(`http://localhost:3001/job-descriptions/${payloadFixture.id}/evaluation`);
    expect(requestInit?.method).toBe('GET');
  });

  it('should surface 404 when the job has no evaluation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ statusCode: 404, message: 'Evaluation not found.' }, 404)),
    );

    await expect(getEvaluationByJobDescription(payloadFixture.id)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('getJobDescription', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should read one job description by id through the contract', async () => {
    const body = {
      id: payloadFixture.id,
      language: 'en',
      requirements: [],
    };
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

    const result = await getJobDescription(payloadFixture.id);

    expect(result.id).toBe(payloadFixture.id);
    expect(requestUrl).toBe(`http://localhost:3001/job-descriptions/${payloadFixture.id}`);
    expect(requestInit?.method).toBe('GET');
  });
});

describe('denyGap', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should post the requirement id to the deny-gap verb of the evaluation', async () => {
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input);
      requestInit = init;
      return jsonResponse({ denied: true, normalizedConcept: 'kubernetes' }, 200);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await denyGap(EVALUATION_ID, payloadFixture.id);

    expect(result.denied).toBe(true);
    expect(result.normalizedConcept).toBe('kubernetes');
    expect(requestUrl).toBe(`http://localhost:3001/evaluations/${EVALUATION_ID}/deny-gap`);
    expect(requestInit?.method).toBe('POST');
    expect(requestInit?.body).toBe(JSON.stringify({ requirementId: payloadFixture.id }));
  });
});

describe('undenyGap', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should post the requirement id to the undeny-gap verb and return the updated evaluation', async () => {
    const evaluationBody = { ...queuedEvaluation(), status: 'ready', matchScore: 80 };
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input);
      requestInit = init;
      return jsonResponse(evaluationBody, 200);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await undenyGap(EVALUATION_ID, payloadFixture.id);

    expect(result.status).toBe('ready');
    expect(result.matchScore).toBe(80);
    expect(requestUrl).toBe(`http://localhost:3001/evaluations/${EVALUATION_ID}/undeny-gap`);
    expect(requestInit?.method).toBe('POST');
    expect(requestInit?.body).toBe(JSON.stringify({ requirementId: payloadFixture.id }));
  });
});

describe('aiErrorCodeOf', () => {
  it('should read the AI code carried by an ApiError payload', () => {
    const error = new ApiError(422, 'rejected', {
      statusCode: 422,
      code: 'ai_key_rejected',
      message: 'rejected',
    });

    expect(aiErrorCodeOf(error)).toBe('ai_key_rejected');
  });

  it('should return null when the payload carries no code', () => {
    const error = new ApiError(422, 'not a job', {
      statusCode: 422,
      message: 'not a job',
    });

    expect(aiErrorCodeOf(error)).toBeNull();
  });

  it('should return null when the code is unknown', () => {
    const error = new ApiError(422, 'unknown', { code: 'ai_unknown' });

    expect(aiErrorCodeOf(error)).toBeNull();
  });

  it('should return null for non ApiError values', () => {
    expect(aiErrorCodeOf(new NetworkError())).toBeNull();
    expect(aiErrorCodeOf(new Error('boom'))).toBeNull();
    expect(aiErrorCodeOf(null)).toBeNull();
  });
});

describe('getDeepSeekKeyStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should read the key status and parse it through the contract', async () => {
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requestUrl = String(input);
        requestInit = init;
        return jsonResponse({ configured: true, lastFour: '5678' }, 200);
      }),
    );

    const result = await getDeepSeekKeyStatus();

    expect(result).toEqual({ configured: true, lastFour: '5678' });
    expect(requestUrl).toBe('http://localhost:3001/settings/deepseek-key');
    expect(requestInit?.method).toBe('GET');
  });
});

describe('saveDeepSeekKey', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should put the key and return status with balance', async () => {
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    const responseBody = {
      status: { configured: true, lastFour: '5678' },
      balance: { isAvailable: true, balances: [{ currency: 'CNY', totalBalance: '10.00' }] },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requestUrl = String(input);
        requestInit = init;
        return jsonResponse(responseBody, 200);
      }),
    );

    const result = await saveDeepSeekKey('sk-live-key');

    expect(result).toEqual(responseBody);
    expect(requestUrl).toBe('http://localhost:3001/settings/deepseek-key');
    expect(requestInit?.method).toBe('PUT');
    expect(requestInit?.body).toBe(JSON.stringify({ apiKey: 'sk-live-key' }));
  });
});

describe('getDeepSeekBalance', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should read the balance through the contract', async () => {
    const balanceBody = {
      isAvailable: false,
      balances: [{ currency: 'CNY', totalBalance: '0.00' }],
    };
    let requestUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        requestUrl = String(input);
        return jsonResponse(balanceBody, 200);
      }),
    );

    const result = await getDeepSeekBalance();

    expect(result).toEqual(balanceBody);
    expect(requestUrl).toBe('http://localhost:3001/settings/deepseek-balance');
  });
});

const BASE_RESUME_ID = '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01';
const TAILORED_RESUME_ID = '7b2f5a9d-1c6b-5f7c-9e1b-3a4d6e8f0b12';

function baseResumeListItem() {
  return {
    id: BASE_RESUME_ID,
    kind: 'base',
    name: 'Backend focus',
    language: 'pt',
    template: 'comfortable',
    lengthTarget: 2,
    writingMethod: 'xyz',
    tone: 'direct',
    baseResumeId: null,
    jobDescriptionId: null,
    jobTitle: null,
    generationStatus: 'ready',
    failureReason: null,
    createdAt: '2026-09-05T10:00:00.000Z',
    updatedAt: '2026-09-05T10:00:00.000Z',
    exports: [],
  };
}

function tailoredResumeListItem() {
  return {
    id: TAILORED_RESUME_ID,
    kind: 'tailored',
    name: 'Backend focus',
    language: 'en',
    template: 'comfortable',
    lengthTarget: 2,
    writingMethod: 'xyz',
    tone: 'direct',
    baseResumeId: BASE_RESUME_ID,
    jobDescriptionId: payloadFixture.id,
    jobTitle: 'Senior Full Stack Developer',
    generationStatus: 'generating',
    failureReason: null,
    createdAt: '2026-09-06T10:00:00.000Z',
    updatedAt: '2026-09-06T10:00:00.000Z',
    exports: [],
  };
}

function resumeDocumentFixture() {
  return {
    ...baseResumeListItem(),
    adaptationPlan: null,
    adaptationChanges: null,
    adaptationReview: {},
    languageFallback: false,
    matchScore: null,
    contact: {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: null,
      links: null,
    },
    sections: [],
    requirementCoverages: [],
  };
}

describe('listResumes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should read the resume list through the contract', async () => {
    const body = { resumes: [baseResumeListItem(), tailoredResumeListItem()] };
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

    const result = await listResumes();

    expect(result.resumes).toHaveLength(2);
    expect(result.resumes[0]?.kind).toBe('base');
    expect(result.resumes[1]?.kind).toBe('tailored');
    expect(requestUrl).toBe('http://localhost:3001/resumes');
    expect(requestInit?.method).toBe('GET');
  });
});

describe('getResume', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should read one resume document by id through the contract', async () => {
    const body = resumeDocumentFixture();
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

    const result = await getResume(BASE_RESUME_ID);

    expect(result.id).toBe(BASE_RESUME_ID);
    expect(result.sections).toEqual([]);
    expect(requestUrl).toBe(`http://localhost:3001/resumes/${BASE_RESUME_ID}`);
    expect(requestInit?.method).toBe('GET');
  });
});

describe('createBaseResume', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should post the chosen settings and accept the 202 body with the id', async () => {
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requestUrl = String(input);
        requestInit = init;
        return jsonResponse({ id: BASE_RESUME_ID }, 202);
      }),
    );

    const result = await createBaseResume({
      name: 'Backend focus',
      language: 'pt',
      template: 'comfortable',
      lengthTarget: 2,
      writingMethod: 'xyz',
      tone: 'direct',
      sections: [{ kind: 'experience' }, { kind: 'education' }],
    });

    expect(result).toEqual({ id: BASE_RESUME_ID });
    expect(requestUrl).toBe('http://localhost:3001/base-resumes');
    expect(requestInit?.method).toBe('POST');
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      name: 'Backend focus',
      language: 'pt',
      template: 'comfortable',
      lengthTarget: 2,
      writingMethod: 'xyz',
      tone: 'direct',
      sections: [{ kind: 'experience' }, { kind: 'education' }],
    });
  });
});

describe('updateResumeSettings', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should put the settings on the settings sub-resource and return the document', async () => {
    const body = { ...resumeDocumentFixture(), template: 'dense' };
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

    const result = await updateResumeSettings(BASE_RESUME_ID, { template: 'dense' });

    expect(result.template).toBe('dense');
    expect(requestUrl).toBe(`http://localhost:3001/resumes/${BASE_RESUME_ID}/settings`);
    expect(requestInit?.method).toBe('PUT');
    expect(JSON.parse(String(requestInit?.body))).toEqual({ template: 'dense' });
  });
});

describe('updateResumeStructure', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should put the section order on the structure sub-resource and return the document', async () => {
    const sectionId = '11111111-1111-4111-8111-111111111111';
    const body = resumeDocumentFixture();
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

    const result = await updateResumeStructure(BASE_RESUME_ID, {
      sections: [{ id: sectionId, ordinal: 0 }],
    });

    expect(result.id).toBe(BASE_RESUME_ID);
    expect(requestUrl).toBe(`http://localhost:3001/resumes/${BASE_RESUME_ID}/structure`);
    expect(requestInit?.method).toBe('PUT');
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      sections: [{ id: sectionId, ordinal: 0 }],
    });
  });
});

describe('eraseData', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should post the scope and return it', async () => {
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requestUrl = String(input);
        requestInit = init;
        return jsonResponse({ scope: 'everything' }, 200);
      }),
    );

    const result = await eraseData('everything');

    expect(result).toEqual({ scope: 'everything' });
    expect(requestUrl).toBe('http://localhost:3001/data/erase');
    expect(requestInit?.method).toBe('POST');
    expect(requestInit?.body).toBe(JSON.stringify({ scope: 'everything' }));
  });

  it('should post the resumes scope for the resume erasure option', async () => {
    let requestInit: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestInit = init;
        return jsonResponse({ scope: 'resumes' }, 200);
      }),
    );

    const result = await eraseData('resumes');

    expect(result).toEqual({ scope: 'resumes' });
    expect(requestInit?.body).toBe(JSON.stringify({ scope: 'resumes' }));
  });
});

const BULLET_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECTION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const COMMENT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const EVIDENCE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const EXPERIENCE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const EXPORT_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function editedDocumentFixture() {
  return resumeDocumentFixture();
}

describe('createTailoredResume', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should post the base resume and job description ids and accept the 202 body', async () => {
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requestUrl = String(input);
        requestInit = init;
        return jsonResponse({ id: TAILORED_RESUME_ID }, 202);
      }),
    );

    const result = await createTailoredResume({
      baseResumeId: BASE_RESUME_ID,
      jobDescriptionId: payloadFixture.id,
    });

    expect(result).toEqual({ id: TAILORED_RESUME_ID });
    expect(requestUrl).toBe('http://localhost:3001/tailored-resumes');
    expect(requestInit?.method).toBe('POST');
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      baseResumeId: BASE_RESUME_ID,
      jobDescriptionId: payloadFixture.id,
    });
  });
});

describe('createResumeSection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should post the section on the sections sub-resource and return its id', async () => {
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requestUrl = String(input);
        requestInit = init;
        return jsonResponse({ id: SECTION_ID }, 201);
      }),
    );

    const result = await createResumeSection(BASE_RESUME_ID, { kind: 'custom', title: 'Talks', ordinal: 4 });

    expect(result).toEqual({ id: SECTION_ID });
    expect(requestUrl).toBe(`http://localhost:3001/resumes/${BASE_RESUME_ID}/sections`);
    expect(requestInit?.method).toBe('POST');
  });
});

describe('deleteResume', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should delete the resume without expecting a body', async () => {
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requestUrl = String(input);
        requestInit = init;
        return new Response('', { status: 200 });
      }),
    );

    await expect(deleteResume(BASE_RESUME_ID)).resolves.toBeUndefined();
    expect(requestUrl).toBe(`http://localhost:3001/resumes/${BASE_RESUME_ID}`);
    expect(requestInit?.method).toBe('DELETE');
  });
});

describe('updateBullet', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should put the text on the bullet and return the document', async () => {
    const body = editedDocumentFixture();
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

    const result = await updateBullet(BULLET_ID, { text: 'Led the migration.' });

    expect(result.id).toBe(BASE_RESUME_ID);
    expect(requestUrl).toBe(`http://localhost:3001/bullets/${BULLET_ID}`);
    expect(requestInit?.method).toBe('PUT');
    expect(JSON.parse(String(requestInit?.body))).toEqual({ text: 'Led the migration.' });
  });
});

describe('approveSuggestion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should post to the approve verb and return the document', async () => {
    const body = editedDocumentFixture();
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

    const result = await approveSuggestion(BULLET_ID);

    expect(result.id).toBe(BASE_RESUME_ID);
    expect(requestUrl).toBe(`http://localhost:3001/bullets/${BULLET_ID}/approve`);
    expect(requestInit?.method).toBe('POST');
  });
});

describe('denySuggestion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should post to the deny verb and return the document without the bullet', async () => {
    const body = editedDocumentFixture();
    let requestUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        requestUrl = String(input);
        return jsonResponse(body, 200);
      }),
    );

    const result = await denySuggestion(BULLET_ID);

    expect(result.id).toBe(BASE_RESUME_ID);
    expect(requestUrl).toBe(`http://localhost:3001/bullets/${BULLET_ID}/deny`);
  });
});

describe('createSectionComment', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should post the comment text on the section and return the document', async () => {
    const body = editedDocumentFixture();
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

    const result = await createSectionComment(SECTION_ID, { text: 'Shorter, please.' });

    expect(result.id).toBe(BASE_RESUME_ID);
    expect(requestUrl).toBe(`http://localhost:3001/sections/${SECTION_ID}/comments`);
    expect(requestInit?.method).toBe('POST');
    expect(JSON.parse(String(requestInit?.body))).toEqual({ text: 'Shorter, please.' });
  });
});

describe('resolveSectionComment', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should post to the resolve verb of the comment and return the document', async () => {
    const body = editedDocumentFixture();
    let requestUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        requestUrl = String(input);
        return jsonResponse(body, 200);
      }),
    );

    const result = await resolveSectionComment(COMMENT_ID);

    expect(result.id).toBe(BASE_RESUME_ID);
    expect(requestUrl).toBe(`http://localhost:3001/comments/${COMMENT_ID}/resolve`);
  });
});

describe('rewriteSection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should post to the rewrite verb and return the document', async () => {
    const body = { ...editedDocumentFixture(), generationStatus: 'generating' };
    let requestUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        requestUrl = String(input);
        return jsonResponse(body, 202);
      }),
    );

    const result = await rewriteSection(SECTION_ID);

    expect(result.generationStatus).toBe('generating');
    expect(requestUrl).toBe(`http://localhost:3001/sections/${SECTION_ID}/rewrite`);
  });
});

describe('undoSectionRewrite', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should post to the undo verb and return the restored document', async () => {
    const body = editedDocumentFixture();
    let requestUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        requestUrl = String(input);
        return jsonResponse(body, 200);
      }),
    );

    const result = await undoSectionRewrite(SECTION_ID);

    expect(result.id).toBe(BASE_RESUME_ID);
    expect(requestUrl).toBe(`http://localhost:3001/sections/${SECTION_ID}/undo-rewrite`);
  });
});

describe('updateEvidence', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should put the corrected statement and return the document', async () => {
    const body = editedDocumentFixture();
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

    const result = await updateEvidence(EVIDENCE_ID, { statement: 'Left in 2023.' }, BASE_RESUME_ID);

    expect(result.id).toBe(BASE_RESUME_ID);
    expect(requestUrl).toBe(`http://localhost:3001/evidences/${EVIDENCE_ID}?resumeId=${BASE_RESUME_ID}`);
    expect(requestInit?.method).toBe('PUT');
    expect(JSON.parse(String(requestInit?.body))).toEqual({ statement: 'Left in 2023.' });
  });
});

describe('updateExperience', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should put the corrected fields and return the document', async () => {
    const body = editedDocumentFixture();
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

    const result = await updateExperience(EXPERIENCE_ID, { role: 'Staff Engineer' }, BASE_RESUME_ID);

    expect(result.id).toBe(BASE_RESUME_ID);
    expect(requestUrl).toBe(`http://localhost:3001/experiences/${EXPERIENCE_ID}?resumeId=${BASE_RESUME_ID}`);
    expect(JSON.parse(String(requestInit?.body))).toEqual({ role: 'Staff Engineer' });
  });
});

describe('exportResume', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should post the export and return the page count with the overflow flag', async () => {
    const body = { exportId: EXPORT_ID, pageCount: 3, exceedsLengthTarget: true };
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requestUrl = String(input);
        requestInit = init;
        return jsonResponse(body, 201);
      }),
    );

    const result = await exportResume(BASE_RESUME_ID);

    expect(result).toEqual(body);
    expect(requestUrl).toBe(`http://localhost:3001/resumes/${BASE_RESUME_ID}/exports`);
    expect(requestInit?.method).toBe('POST');
  });
});

describe('downloadResumeExport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should fetch the pdf bytes of the export', async () => {
    const pdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    let requestUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        requestUrl = String(input);
        return new Response(pdf, { status: 200, headers: { 'Content-Type': 'application/pdf' } });
      }),
    );

    const result = await downloadResumeExport(EXPORT_ID);

    expect(result).toBeInstanceOf(Blob);
    expect(requestUrl).toBe(`http://localhost:3001/exports/${EXPORT_ID}/pdf`);
  });

  it('should surface a missing export as a typed ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ statusCode: 404, message: 'Export not found.' }, 404)),
    );

    await expect(downloadResumeExport(EXPORT_ID)).rejects.toMatchObject({ status: 404 });
  });
});

function careerProfileFixture() {
  return {
    experiences: [
      {
        id: EXPERIENCE_ID,
        company: 'Acme',
        role: 'Backend Engineer',
        startedOn: '2020-01-01',
        endedOn: null,
      },
    ],
    educationEntries: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        institution: 'UFPE',
        degree: 'Computer Science',
        startedOn: '2016-01-01',
        endedOn: '2019-12-01',
      },
    ],
    evidences: [
      {
        id: EVIDENCE_ID,
        statement: 'Cut latency by 30%.',
        experienceId: EXPERIENCE_ID,
      },
    ],
  };
}

describe('getCareerProfile', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should read the selectable career profile through the contract', async () => {
    const body = careerProfileFixture();
    let requestUrl = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        requestUrl = String(input);
        return jsonResponse(body, 200);
      }),
    );

    const result = await getCareerProfile();

    expect(result.experiences).toHaveLength(1);
    expect(result.educationEntries).toHaveLength(1);
    expect(result.evidences).toHaveLength(1);
    expect(requestUrl).toBe('http://localhost:3001/career-profile');
  });
});

describe('deleteResumeSection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should delete the section and return the document', async () => {
    const body = editedDocumentFixture();
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

    const result = await deleteResumeSection(SECTION_ID);

    expect(result.id).toBe(BASE_RESUME_ID);
    expect(requestUrl).toBe(`http://localhost:3001/sections/${SECTION_ID}`);
    expect(requestInit?.method).toBe('DELETE');
  });
});

describe('moveResumeBullet', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should post the direction and return the document', async () => {
    const body = editedDocumentFixture();
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

    const result = await moveResumeBullet(BULLET_ID, { direction: 'up' });

    expect(result.id).toBe(BASE_RESUME_ID);
    expect(requestUrl).toBe(`http://localhost:3001/bullets/${BULLET_ID}/move`);
    expect(requestInit?.method).toBe('POST');
    expect(JSON.parse(String(requestInit?.body))).toEqual({ direction: 'up' });
  });
});

describe('deleteResumeBullet', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should delete the bullet and return the document', async () => {
    const body = editedDocumentFixture();
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

    const result = await deleteResumeBullet(BULLET_ID);

    expect(result.id).toBe(BASE_RESUME_ID);
    expect(requestUrl).toBe(`http://localhost:3001/bullets/${BULLET_ID}`);
    expect(requestInit?.method).toBe('DELETE');
  });
});

describe('addCustomSectionItem', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should post the text and return the document', async () => {
    const body = editedDocumentFixture();
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

    const result = await addCustomSectionItem(SECTION_ID, { text: 'Second talk' });

    expect(result.id).toBe(BASE_RESUME_ID);
    expect(requestUrl).toBe(`http://localhost:3001/sections/${SECTION_ID}/items`);
    expect(requestInit?.method).toBe('POST');
    expect(JSON.parse(String(requestInit?.body))).toEqual({ text: 'Second talk' });
  });
});

describe('deleteCustomSectionEntry', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should delete the entry and return the document', async () => {
    const body = editedDocumentFixture();
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

    const result = await deleteCustomSectionEntry(SECTION_ID);

    expect(result.id).toBe(BASE_RESUME_ID);
    expect(requestUrl).toBe(`http://localhost:3001/entries/${SECTION_ID}`);
    expect(requestInit?.method).toBe('DELETE');
  });
});

describe('reviewAdaptationChange', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should post the evidence decision to the adaptation-review verb and return the document', async () => {
    const body = editedDocumentFixture();
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

    const result = await reviewAdaptationChange(BASE_RESUME_ID, {
      evidenceId: EVIDENCE_ID,
      decision: 'rejected',
    });

    expect(result.id).toBe(BASE_RESUME_ID);
    expect(requestUrl).toBe(`http://localhost:3001/resumes/${BASE_RESUME_ID}/adaptation-review`);
    expect(requestInit?.method).toBe('POST');
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      evidenceId: EVIDENCE_ID,
      decision: 'rejected',
    });
  });

  it('should surface a 422 when the decision does not apply', async () => {
    const failure = { statusCode: 422, message: 'Decision does not apply to this evidence.' };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(failure, 422)));

    await expect(
      reviewAdaptationChange(BASE_RESUME_ID, { evidenceId: EVIDENCE_ID, decision: 'restored' }),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe('undoAdaptationChange', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should post the evidence id to the undo verb and return the document', async () => {
    const body = editedDocumentFixture();
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

    const result = await undoAdaptationChange(BASE_RESUME_ID, { evidenceId: EVIDENCE_ID });

    expect(result.id).toBe(BASE_RESUME_ID);
    expect(requestUrl).toBe(
      `http://localhost:3001/resumes/${BASE_RESUME_ID}/adaptation-review/undo`,
    );
    expect(requestInit?.method).toBe('POST');
    expect(JSON.parse(String(requestInit?.body))).toEqual({ evidenceId: EVIDENCE_ID });
  });

  it('should surface a 422 when there is no decision to undo', async () => {
    const failure = { statusCode: 422, message: 'There is no decision to undo.' };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(failure, 422)));

    await expect(undoAdaptationChange(BASE_RESUME_ID, { evidenceId: EVIDENCE_ID })).rejects.toMatchObject({
      status: 422,
    });
  });
});

const SKILL_PROPOSAL_ID = '99999999-9999-4999-8999-999999999999';

describe('acceptSkillProposal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should post to the accept verb of the skill proposal and return the document', async () => {
    const body = editedDocumentFixture();
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

    const result = await acceptSkillProposal(BASE_RESUME_ID, SKILL_PROPOSAL_ID);

    expect(result.id).toBe(BASE_RESUME_ID);
    expect(requestUrl).toBe(
      `http://localhost:3001/resumes/${BASE_RESUME_ID}/skill-proposals/${SKILL_PROPOSAL_ID}/accept`,
    );
    expect(requestInit?.method).toBe('POST');
  });

  it('should surface a 422 when the proposal cannot be accepted', async () => {
    const failure = { statusCode: 422, message: 'Skill proposal is not pending.' };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(failure, 422)));

    await expect(acceptSkillProposal(BASE_RESUME_ID, SKILL_PROPOSAL_ID)).rejects.toMatchObject({
      status: 422,
    });
  });
});

describe('rejectSkillProposal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should post to the reject verb of the skill proposal and return the document', async () => {
    const body = editedDocumentFixture();
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

    const result = await rejectSkillProposal(BASE_RESUME_ID, SKILL_PROPOSAL_ID);

    expect(result.id).toBe(BASE_RESUME_ID);
    expect(requestUrl).toBe(
      `http://localhost:3001/resumes/${BASE_RESUME_ID}/skill-proposals/${SKILL_PROPOSAL_ID}/reject`,
    );
    expect(requestInit?.method).toBe('POST');
  });

  it('should surface a 422 when the proposal cannot be rejected', async () => {
    const failure = { statusCode: 422, message: 'Skill proposal is not pending.' };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(failure, 422)));

    await expect(rejectSkillProposal(BASE_RESUME_ID, SKILL_PROPOSAL_ID)).rejects.toMatchObject({
      status: 422,
    });
  });
});
