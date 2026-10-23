import { z, type ZodType, type ZodTypeDef } from 'zod';
import { aiErrorCodeSchema, type AiErrorCode } from 'schema/contracts/ai-error';
import {
  deepSeekBalanceSchema,
  deepSeekKeyStatusSchema,
  type DeepSeekBalance,
  type DeepSeekKeyStatus,
} from 'schema/contracts/settings';
import {
  baseResumeProposalResponseSchema,
  resumeImportResponseSchema,
  type BaseResumeProposalResponse,
  type ResumeImportDraft,
  type ResumeImportResponse,
} from 'schema/contracts/resume-import';
import {
  denyGapResponseSchema,
  evaluationResponseSchema,
  resumeReevaluationLatestResponseSchema,
  type DenyGapResponse,
  type EvaluationResponse,
  type ResumeReevaluationLatestResponse,
} from 'schema/contracts/evaluation';
import {
  jobDescriptionResponseSchema,
  type JobDescriptionResponse,
} from 'schema/contracts/job-description';
import {
  careerProfileResponseSchema,
  type CareerProfileEducation,
  type CareerProfileEvidence,
  type CareerProfileExperience,
  type CareerProfileResponse,
} from 'schema/contracts/career-profile';
import {
  createResumeResponseSchema,
  exportResumeResponseSchema,
  resumeDocumentResponseSchema,
  resumeListResponseSchema,
  type AdaptationReviewRequest,
  type AdaptationReviewUndoRequest,
  type AddCustomItemRequest,
  type CreateBaseResumeRequest,
  type BaseResumeSectionSelection,
  type CreateResumeResponse,
  type CreateResumeSectionRequest,
  type CreateTailoredResumeRequest,
  type ExportResumeResponse,
  type MoveBulletRequest,
  type ResumeDocumentResponse,
  type ResumeListResponse,
  type UpdateEvidenceRequest,
  type UpdateExperienceRequest,
  type UpdateBulletRequest,
  type CreateSectionCommentRequest,
  type UpdateResumeSettingsRequest,
  type UpdateResumeStructureRequest,
} from 'schema/contracts/resume';

const DEFAULT_API_BASE_URL = 'http://localhost:3001';
const TRAILING_SLASH = /\/$/;

const rawApiBaseUrl = process.env['NEXT_PUBLIC_API_URL'];
const API_BASE_URL = (rawApiBaseUrl ?? DEFAULT_API_BASE_URL).replace(TRAILING_SLASH, '');

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

interface ApiRequestOptions<TResponse> {
  readonly path: string;
  readonly method: ApiMethod;
  readonly responseSchema: ZodType<TResponse, ZodTypeDef, unknown>;
  readonly body?: unknown;
  readonly formData?: FormData;
  readonly headers?: Readonly<Record<string, string>>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly serverMessage: string | undefined;
  readonly payload: unknown;

  constructor(status: number, serverMessage: string | undefined, payload: unknown = undefined) {
    super(`Request to the API failed with status ${String(status)}.`);
    this.name = 'ApiError';
    this.status = status;
    this.serverMessage = serverMessage;
    this.payload = payload;
  }
}

export class NetworkError extends Error {
  constructor() {
    super('The API could not be reached.');
    this.name = 'NetworkError';
  }
}

export class InvalidResponseError extends Error {
  constructor() {
    super('The API replied with a payload that does not match its contract.');
    this.name = 'InvalidResponseError';
  }
}

function serverMessageOf(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const message: unknown = (payload as Record<string, unknown>)['message'];
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) {
    const [firstMessage] = message;
    if (typeof firstMessage === 'string') return firstMessage;
  }
  return undefined;
}

async function sendRequest(options: ApiRequestOptions<unknown>): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.headers !== undefined) Object.assign(headers, options.headers);
  if (options.body !== undefined && options.formData === undefined) {
    headers['Content-Type'] = 'application/json';
  }
  try {
    return await fetch(`${API_BASE_URL}${options.path}`, {
      method: options.method,
      headers,
      body: options.formData ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
    });
  } catch {
    throw new NetworkError();
  }
}

export async function apiRequest<TResponse>(
  options: ApiRequestOptions<TResponse>,
): Promise<TResponse> {
  const response = await sendRequest(options);
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new ApiError(response.status, serverMessageOf(payload), payload);
  }
  const parsed = options.responseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new InvalidResponseError();
  }
  return parsed.data;
}

export async function uploadSourceDocument(file: File): Promise<ResumeImportResponse> {
  const formData = new FormData();
  formData.append('file', file);
  return await apiRequest({
    path: '/resume-imports',
    method: 'POST',
    formData,
    responseSchema: resumeImportResponseSchema,
  });
}

export async function getResumeImport(resumeImportId: string): Promise<ResumeImportResponse> {
  return await apiRequest({
    path: `/resume-imports/${resumeImportId}`,
    method: 'GET',
    responseSchema: resumeImportResponseSchema,
  });
}

export async function saveResumeImportDraft(
  resumeImportId: string,
  draft: ResumeImportDraft,
): Promise<ResumeImportResponse> {
  return await apiRequest({
    path: `/resume-imports/${resumeImportId}/draft`,
    method: 'PUT',
    body: draft,
    responseSchema: resumeImportResponseSchema,
  });
}

export async function confirmResumeImport(resumeImportId: string): Promise<ResumeImportResponse> {
  return await apiRequest({
    path: `/resume-imports/${resumeImportId}/confirm`,
    method: 'POST',
    responseSchema: resumeImportResponseSchema,
  });
}

export async function getBaseResumeProposal(
  resumeImportId: string,
): Promise<BaseResumeProposalResponse> {
  return await apiRequest({
    path: `/resume-imports/${resumeImportId}/base-resume-proposal`,
    method: 'GET',
    responseSchema: baseResumeProposalResponseSchema,
  });
}

export async function createEvaluation(jobDescriptionId: string): Promise<EvaluationResponse> {
  return await apiRequest({
    path: '/evaluations',
    method: 'POST',
    body: { jobDescriptionId },
    responseSchema: evaluationResponseSchema,
  });
}

export async function getEvaluation(evaluationId: string): Promise<EvaluationResponse> {
  return await apiRequest({
    path: `/evaluations/${evaluationId}`,
    method: 'GET',
    responseSchema: evaluationResponseSchema,
  });
}

export async function getEvaluationByJobDescription(
  jobDescriptionId: string,
): Promise<EvaluationResponse> {
  return await apiRequest({
    path: `/job-descriptions/${jobDescriptionId}/evaluation`,
    method: 'GET',
    responseSchema: evaluationResponseSchema,
  });
}

export async function createResumeEvaluation(resumeId: string): Promise<EvaluationResponse> {
  return await apiRequest({
    path: `/resumes/${resumeId}/evaluations`,
    method: 'POST',
    responseSchema: evaluationResponseSchema,
  });
}

export async function getLatestResumeEvaluation(
  resumeId: string,
): Promise<ResumeReevaluationLatestResponse> {
  return await apiRequest({
    path: `/resumes/${resumeId}/evaluations/latest`,
    method: 'GET',
    responseSchema: resumeReevaluationLatestResponseSchema,
  });
}

export async function getJobDescription(jobDescriptionId: string): Promise<JobDescriptionResponse> {
  return await apiRequest({
    path: `/job-descriptions/${jobDescriptionId}`,
    method: 'GET',
    responseSchema: jobDescriptionResponseSchema,
  });
}

export async function listResumes(): Promise<ResumeListResponse> {
  return await apiRequest({
    path: '/resumes',
    method: 'GET',
    responseSchema: resumeListResponseSchema,
  });
}

export async function getResume(resumeId: string): Promise<ResumeDocumentResponse> {
  return await apiRequest({
    path: `/resumes/${resumeId}`,
    method: 'GET',
    responseSchema: resumeDocumentResponseSchema,
  });
}

export async function createBaseResume(
  request: CreateBaseResumeInput,
): Promise<CreateResumeResponse> {
  return await apiRequest({
    path: '/base-resumes',
    method: 'POST',
    body: request,
    responseSchema: createResumeResponseSchema,
  });
}

export async function createTailoredResume(
  request: CreateTailoredResumeRequest,
): Promise<CreateResumeResponse> {
  return await apiRequest({
    path: '/tailored-resumes',
    method: 'POST',
    body: request,
    responseSchema: createResumeResponseSchema,
  });
}

export async function createResumeSection(
  resumeId: string,
  request: CreateResumeSectionRequest,
): Promise<CreateResumeResponse> {
  return await apiRequest({
    path: `/resumes/${resumeId}/sections`,
    method: 'POST',
    body: request,
    responseSchema: createResumeResponseSchema,
  });
}

const deleteResumeResponseSchema = z.void();

export async function deleteResume(resumeId: string): Promise<void> {
  await apiRequest({
    path: `/resumes/${resumeId}`,
    method: 'DELETE',
    responseSchema: deleteResumeResponseSchema,
  });
}

export async function updateBullet(
  bulletId: string,
  request: UpdateBulletRequest,
): Promise<ResumeDocumentResponse> {
  return await apiRequest({
    path: `/bullets/${bulletId}`,
    method: 'PUT',
    body: request,
    responseSchema: resumeDocumentResponseSchema,
  });
}

export async function approveSuggestion(bulletId: string): Promise<ResumeDocumentResponse> {
  return await apiRequest({
    path: `/bullets/${bulletId}/approve`,
    method: 'POST',
    responseSchema: resumeDocumentResponseSchema,
  });
}

export async function denySuggestion(bulletId: string): Promise<ResumeDocumentResponse> {
  return await apiRequest({
    path: `/bullets/${bulletId}/deny`,
    method: 'POST',
    responseSchema: resumeDocumentResponseSchema,
  });
}

export async function createSectionComment(
  sectionId: string,
  request: CreateSectionCommentRequest,
): Promise<ResumeDocumentResponse> {
  return await apiRequest({
    path: `/sections/${sectionId}/comments`,
    method: 'POST',
    body: request,
    responseSchema: resumeDocumentResponseSchema,
  });
}

export async function resolveSectionComment(commentId: string): Promise<ResumeDocumentResponse> {
  return await apiRequest({
    path: `/comments/${commentId}/resolve`,
    method: 'POST',
    responseSchema: resumeDocumentResponseSchema,
  });
}

export async function rewriteSection(sectionId: string): Promise<ResumeDocumentResponse> {
  return await apiRequest({
    path: `/sections/${sectionId}/rewrite`,
    method: 'POST',
    responseSchema: resumeDocumentResponseSchema,
  });
}

export async function requestSectionRewrite(
  sectionId: string,
  instruction: string,
): Promise<ResumeDocumentResponse> {
  return await apiRequest({
    path: `/sections/${sectionId}/rewrite`,
    method: 'POST',
    body: { instruction },
    responseSchema: resumeDocumentResponseSchema,
  });
}

export async function undoSectionRewrite(sectionId: string): Promise<ResumeDocumentResponse> {
  return await apiRequest({
    path: `/sections/${sectionId}/undo-rewrite`,
    method: 'POST',
    responseSchema: resumeDocumentResponseSchema,
  });
}

export async function updateEvidence(
  evidenceId: string,
  request: UpdateEvidenceRequest,
  resumeId: string,
): Promise<ResumeDocumentResponse> {
  return await apiRequest({
    path: `/evidences/${evidenceId}?resumeId=${encodeURIComponent(resumeId)}`,
    method: 'PUT',
    body: request,
    responseSchema: resumeDocumentResponseSchema,
  });
}

export async function updateExperience(
  experienceId: string,
  request: UpdateExperienceRequest,
  resumeId: string,
): Promise<ResumeDocumentResponse> {
  return await apiRequest({
    path: `/experiences/${experienceId}?resumeId=${encodeURIComponent(resumeId)}`,
    method: 'PUT',
    body: request,
    responseSchema: resumeDocumentResponseSchema,
  });
}

export async function exportResume(resumeId: string): Promise<ExportResumeResponse> {
  return await apiRequest({
    path: `/resumes/${resumeId}/exports`,
    method: 'POST',
    responseSchema: exportResumeResponseSchema,
  });
}

export async function downloadResumeExport(exportId: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/exports/${exportId}/pdf`, { method: 'GET' });
  } catch {
    throw new NetworkError();
  }
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => undefined);
    throw new ApiError(response.status, serverMessageOf(payload), payload);
  }
  return await response.blob();
}

export async function updateResumeSettings(
  resumeId: string,
  settings: UpdateResumeSettingsRequest,
): Promise<ResumeDocumentResponse> {
  return await apiRequest({
    path: `/resumes/${resumeId}/settings`,
    method: 'PUT',
    body: settings,
    responseSchema: resumeDocumentResponseSchema,
  });
}

export async function updateResumeStructure(
  resumeId: string,
  structure: UpdateResumeStructureRequest,
): Promise<ResumeDocumentResponse> {
  return await apiRequest({
    path: `/resumes/${resumeId}/structure`,
    method: 'PUT',
    body: structure,
    responseSchema: resumeDocumentResponseSchema,
  });
}

export async function deleteResumeSection(sectionId: string): Promise<ResumeDocumentResponse> {
  return await apiRequest({
    path: `/sections/${sectionId}`,
    method: 'DELETE',
    responseSchema: resumeDocumentResponseSchema,
  });
}

export async function moveResumeBullet(
  bulletId: string,
  request: MoveBulletRequest,
): Promise<ResumeDocumentResponse> {
  return await apiRequest({
    path: `/bullets/${bulletId}/move`,
    method: 'POST',
    body: request,
    responseSchema: resumeDocumentResponseSchema,
  });
}

export async function deleteResumeBullet(bulletId: string): Promise<ResumeDocumentResponse> {
  return await apiRequest({
    path: `/bullets/${bulletId}`,
    method: 'DELETE',
    responseSchema: resumeDocumentResponseSchema,
  });
}

export async function addCustomSectionItem(
  sectionId: string,
  request: AddCustomItemRequest,
): Promise<ResumeDocumentResponse> {
  return await apiRequest({
    path: `/sections/${sectionId}/items`,
    method: 'POST',
    body: request,
    responseSchema: resumeDocumentResponseSchema,
  });
}

export async function deleteCustomSectionEntry(entryId: string): Promise<ResumeDocumentResponse> {
  return await apiRequest({
    path: `/entries/${entryId}`,
    method: 'DELETE',
    responseSchema: resumeDocumentResponseSchema,
  });
}

export async function denyGap(evaluationId: string, requirementId: string): Promise<DenyGapResponse> {
  return await apiRequest({
    path: `/evaluations/${evaluationId}/deny-gap`,
    method: 'POST',
    body: { requirementId },
    responseSchema: denyGapResponseSchema,
  });
}

export async function undenyGap(
  evaluationId: string,
  requirementId: string,
): Promise<EvaluationResponse> {
  return await apiRequest({
    path: `/evaluations/${evaluationId}/undeny-gap`,
    method: 'POST',
    body: { requirementId },
    responseSchema: evaluationResponseSchema,
  });
}

export async function reviewAdaptationChange(
  resumeId: string,
  request: AdaptationReviewRequest,
): Promise<ResumeDocumentResponse> {
  return await apiRequest({
    path: `/resumes/${resumeId}/adaptation-review`,
    method: 'POST',
    body: request,
    responseSchema: resumeDocumentResponseSchema,
  });
}

export async function undoAdaptationChange(
  resumeId: string,
  request: AdaptationReviewUndoRequest,
): Promise<ResumeDocumentResponse> {
  return await apiRequest({
    path: `/resumes/${resumeId}/adaptation-review/undo`,
    method: 'POST',
    body: request,
    responseSchema: resumeDocumentResponseSchema,
  });
}

export async function acceptSkillProposal(
  resumeId: string,
  proposalId: string,
): Promise<ResumeDocumentResponse> {
  return await apiRequest({
    path: `/resumes/${resumeId}/skill-proposals/${proposalId}/accept`,
    method: 'POST',
    responseSchema: resumeDocumentResponseSchema,
  });
}

export async function rejectSkillProposal(
  resumeId: string,
  proposalId: string,
): Promise<ResumeDocumentResponse> {
  return await apiRequest({
    path: `/resumes/${resumeId}/skill-proposals/${proposalId}/reject`,
    method: 'POST',
    responseSchema: resumeDocumentResponseSchema,
  });
}

const saveDeepSeekKeyResponseSchema = z.object({
  status: deepSeekKeyStatusSchema,
  balance: deepSeekBalanceSchema,
});

export type SaveDeepSeekKeyResponse = z.infer<typeof saveDeepSeekKeyResponseSchema>;

const DATA_ERASURE_SCOPES = ['job_descriptions', 'career_profile', 'resumes', 'everything'] as const;

export type DataErasureScope = (typeof DATA_ERASURE_SCOPES)[number];

const dataErasureResponseSchema = z.object({
  scope: z.enum(DATA_ERASURE_SCOPES),
});

export type DataErasureResponse = z.infer<typeof dataErasureResponseSchema>;

export function aiErrorCodeOf(error: unknown): AiErrorCode | null {
  if (!(error instanceof ApiError)) return null;
  if (typeof error.payload !== 'object' || error.payload === null) return null;
  const code: unknown = (error.payload as Record<string, unknown>)['code'];
  const parsed = aiErrorCodeSchema.safeParse(code);
  if (!parsed.success) return null;
  return parsed.data;
}

export async function getDeepSeekKeyStatus(): Promise<DeepSeekKeyStatus> {
  return await apiRequest({
    path: '/settings/deepseek-key',
    method: 'GET',
    responseSchema: deepSeekKeyStatusSchema,
  });
}

export async function saveDeepSeekKey(apiKey: string): Promise<SaveDeepSeekKeyResponse> {
  return await apiRequest({
    path: '/settings/deepseek-key',
    method: 'PUT',
    body: { apiKey },
    responseSchema: saveDeepSeekKeyResponseSchema,
  });
}

export async function getDeepSeekBalance(): Promise<DeepSeekBalance> {
  return await apiRequest({
    path: '/settings/deepseek-balance',
    method: 'GET',
    responseSchema: deepSeekBalanceSchema,
  });
}

export async function eraseData(scope: DataErasureScope): Promise<DataErasureResponse> {
  return await apiRequest({
    path: '/data/erase',
    method: 'POST',
    body: { scope },
    responseSchema: dataErasureResponseSchema,
  });
}

export type {
  CareerProfileEducation,
  CareerProfileEvidence,
  CareerProfileExperience,
  CareerProfileResponse,
  BaseResumeProposalResponse,
};

export async function getCareerProfile(): Promise<CareerProfileResponse> {
  return await apiRequest({
    path: '/career-profile',
    method: 'GET',
    responseSchema: careerProfileResponseSchema,
  });
}

export interface BaseResumeSectionInput {
  readonly kind: BaseResumeSectionSelection['kind'];
  readonly title?: string | null;
  readonly experienceIds?: string[];
  readonly educationEntryIds?: string[];
  readonly evidenceIds?: string[];
  readonly items?: string[];
  readonly skillIds?: string[];
  readonly entries?: ReadonlyArray<{
    readonly experienceId?: string | null;
    readonly educationEntryId?: string | null;
    readonly bullets: ReadonlyArray<{
      readonly evidenceId: string | null;
      readonly text: string;
    }>;
  }>;
}

export interface CreateBaseResumeInput
  extends Omit<CreateBaseResumeRequest, 'sections' | 'language' | 'template' | 'writingMethod' | 'tone'> {
  readonly language?: CreateBaseResumeRequest['language'];
  readonly template?: CreateBaseResumeRequest['template'];
  readonly writingMethod?: CreateBaseResumeRequest['writingMethod'];
  readonly tone?: CreateBaseResumeRequest['tone'];
  readonly sections?: BaseResumeSectionInput[];
}
