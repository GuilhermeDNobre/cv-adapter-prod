import 'reflect-metadata';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client, Pool } from 'pg';
import * as schema from 'schema';
import type { DeepSeekBalance } from 'schema/contracts/settings';
import { AI_CLIENT, type AiClient, type AiRequest } from '../src/modules/ai/ai-client';
import { AiKeyRejectedError } from '../src/modules/ai/ai-errors';
import {
  DEEPSEEK_ACCOUNT,
  type DeepSeekAccount,
} from '../src/modules/settings/deepseek-account.client';
import { AppModule } from '../src/app.module';
import { WorkerModule } from '../src/worker.module';
import { configureApp } from '../src/main';

export const E2E_INVALID_KEY_PREFIX = 'sk-e2e-invalid';
export const E2E_NO_BALANCE_KEY_PREFIX = 'sk-e2e-nobalance';

const E2E_FIXED_BALANCE: DeepSeekBalance = {
  isAvailable: true,
  balances: [{ currency: 'CNY', totalBalance: '10.00' }],
};

const E2E_EMPTY_BALANCE: DeepSeekBalance = {
  isAvailable: false,
  balances: [{ currency: 'CNY', totalBalance: '0.00' }],
};

const deepSeekAccountMock: DeepSeekAccount = {
  fetchBalance: async (apiKey: string): Promise<DeepSeekBalance> => {
    if (apiKey.startsWith(E2E_INVALID_KEY_PREFIX)) throw new AiKeyRejectedError();
    if (apiKey.startsWith(E2E_NO_BALANCE_KEY_PREFIX)) return E2E_EMPTY_BALANCE;
    return E2E_FIXED_BALANCE;
  },
};

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: { port: { type: 'string', default: '3101' } },
});
const PORT = parseInt(values.port ?? '3101', 10);

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/cv_adapter';
const TEST_DATABASE = 'cv_adapter_e2e';

function urlWithDatabase(database: string): string {
  const url = new URL(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
  url.pathname = database;
  return url.toString();
}

async function withAdminClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: urlWithDatabase('/postgres') });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

const MIGRATIONS_FOLDER = path.resolve(process.cwd(), '../../packages/schema/migrations');

const aiClientMock: AiClient = {
  complete: async <TOutput>(request: AiRequest<TOutput>): Promise<TOutput> =>
    request.outputSchema.parse(cannedAnswerFor(request)),
};

function cannedPlanAdaptation(payload: Record<string, unknown>): unknown {
  const requirements = (payload.requirements ?? []) as Array<{ id: string }>;
  const evidences = (payload.evidences ?? []) as Array<{ id: string }>;
  const evidenceIds = evidences.map((evidence) => evidence.id);
  return {
    allocations: [{ sectionKind: 'experience', evidenceIds }],
    coverages: requirements.map((requirement, index) => ({
      requirementId: requirement.id,
      coverage: index === 0 ? 'covered' : 'gap',
      evidenceId: index === 0 ? (evidenceIds[0] ?? null) : null,
      gapKind: index === 0 ? null : 'existence',
    })),
  };
}

function cannedBulletText(statement: string): string {
  if (statement.toLowerCase().includes('react')) {
    return `${statement.replace(/react/gi, 'dashboard')} with 42% revenue growth`;
  }
  return `${statement} rewritten in a direct tone`;
}

function looksPortuguese(statement: string): boolean {
  const lower = statement.toLowerCase();
  if (/[à-úâêôãõç]/.test(lower)) return true;
  const markers = [
    'liderei',
    'gerenciei',
    'equipe',
    'entregas',
    'mensais',
    'responsavel',
    'responsável',
    'formacao',
    'formação',
    'experiencia',
    'experiência',
    'habilidades',
    ' nao ',
    ' não ',
    ' com ',
    ' para ',
    ' que ',
    ' uma ',
    ' como ',
    ' mais ',
    ' foi ',
    ' sao ',
    ' são ',
  ];
  return markers.some((marker) => lower.includes(marker));
}

function cannedWriteSection(payload: Record<string, unknown>): unknown {
  const evidences = (payload.evidences ?? []) as Array<{ id: string; statement: string }>;
  const language = payload.language as string | undefined;
  return {
    bullets: evidences.map((evidence) => ({
      evidenceId: evidence.id,
      text: cannedWriteBulletText(evidence.statement, evidence.id, language),
    })),
  };
}

function cannedWriteBulletText(statement: string, evidenceId: string, language: string | undefined): string {
  if (language === 'en' && looksPortuguese(statement)) {
    const suffix = evidenceId.slice(0, 4).toLowerCase().replace(/[^a-z]/g, 'x');
    if (suffix.charCodeAt(0) % 2 === 0) {
      return `led delivery with measurable outcomes ${suffix}`;
    }
    return `managed work with consistent delivery ${suffix}`;
  }
  if (language === 'pt' && !looksPortuguese(statement)) {
    return 'Liderei equipe com entregas mensais e resultados comprovados';
  }
  return cannedBulletText(statement);
}

function cannedSynthesizeSection(payload: Record<string, unknown>): unknown {
  const sectionKind = payload.sectionKind as string | undefined;
  const language = payload.language as string | undefined;
  if (language === 'pt') {
    if (sectionKind === 'summary') {
      return {
        bullets: [
          { text: 'Engenheiro com equipe e entregas mensais.' },
          { text: 'Foco em resultados com responsabilidade.' },
        ],
      };
    }
    return {
      bullets: [{ text: 'TypeScript com equipe' }, { text: 'React com entregas' }],
    };
  }
  if (sectionKind === 'summary') {
    return {
      bullets: [
        { text: 'Experienced engineer working with modern stacks.' },
        { text: 'Focused on delivery and collaboration.' },
      ],
    };
  }
  return {
    bullets: [{ text: 'TypeScript expert' }, { text: 'React specialist' }],
  };
}

function cannedDetectWritingStyle(): unknown {
  return { writingMethod: 'xyz', tone: 'direct', averageBulletWords: 12 };
}

function cannedRewriteBulletsInStyle(payload: Record<string, unknown>): unknown {
  const evidences = (payload.evidences ?? []) as Array<{ id: string; statement: string }>;
  return {
    bullets: evidences.map((evidence) => ({
      evidenceId: evidence.id,
      text: `${evidence.statement} rewritten in XYZ direct style`,
    })),
  };
}

function cannedRefineItem(payload: Record<string, unknown>): unknown {
  const text = (payload.text as string | undefined) ?? '';
  const language = (payload.language as string | undefined) ?? 'en';
  if (language === 'pt') {
    return { refined: `${text} refinado com equipe` };
  }
  return { refined: `${text} refined with measurable impact` };
}

function cannedDraftSuggestions(payload: Record<string, unknown>): unknown {
  const gaps = (payload.gaps ?? []) as Array<{
    requirementId: string;
    literalTerm: string;
    gapKind: string;
    adjacentCompany: string | null;
  }>;
  return {
    suggestions: gaps.map((gap) => ({
      requirementId: gap.requirementId,
      gapKind: gap.gapKind,
      question: `Do you have experience with ${gap.literalTerm}?`,
      draftBullet: `Draft experience with ${gap.literalTerm} building on work at ${gap.adjacentCompany ?? 'Tech Corp'}.`,
    })),
  };
}

function cannedAnswerFor(request: AiRequest<unknown>): unknown {
  {
    const promptName = request.promptName;
    if (promptName === 'parse-job-description') {
      return {
        isJobDescription: true,
        language: 'en',
        requirements: [
          { literalTerm: 'TypeScript', concept: 'TypeScript programming', kind: 'mandatory' },
          { literalTerm: 'React', concept: 'React framework', kind: 'desirable' },
        ],
      };
    }
    if (promptName === 'extract-resume-draft') {
      return {
        experiences: [
          {
            company: 'Tech Corp',
            role: 'Senior Developer',
            startedOn: '2020-01-01',
            endedOn: null,
          },
        ],
        education: [
          {
            institution: 'University',
            degree: 'Computer Science',
            startedOn: '2016-01-01',
            endedOn: '2020-01-01',
          },
        ],
        evidences: [
          { statement: 'Built scalable TypeScript applications for 5 years', experienceIndex: 0 },
          { statement: 'Led React migration for enterprise dashboard', experienceIndex: 0 },
        ],
        skills: [
          { name: 'TypeScript', group: null },
          { name: 'React', group: null },
        ],
        languages: [],
        certifications: [],
        sectionOrder: ['experience', 'education', 'skills'],
      };
    }
    if (promptName === 'detect-writing-style') {
      return cannedDetectWritingStyle();
    }
    if (promptName === 'rewrite-bullets-in-style') {
      return cannedRewriteBulletsInStyle(request.payload);
    }
    if (promptName === 'refine-item') {
      return cannedRefineItem(request.payload);
    }
    if (promptName === 'evaluate-coverage') {
      const requirements = (request.payload.requirements ?? []) as Array<{ id: string }>;
      const evidences = (request.payload.evidences ?? []) as Array<{ id: string }>;
      const coveringEvidenceId = evidences[0]?.id ?? null;
      return {
        coverages: requirements.map((requirement, index) => ({
          requirementId: requirement.id,
          coverage: index === 0 ? 'covered' : 'gap',
          evidenceId: index === 0 ? coveringEvidenceId : null,
          rationale:
            index === 0
              ? 'Strong TypeScript experience'
              : 'No direct React leadership evidence',
        })),
      };
    }
    if (promptName === 'draft-suggestions') {
      return cannedDraftSuggestions(request.payload);
    }
    if (promptName === 'plan-adaptation') {
      return cannedPlanAdaptation(request.payload);
    }
    if (promptName === 'write-section') {
      return cannedWriteSection(request.payload);
    }
    if (promptName === 'synthesize-section') {
      return cannedSynthesizeSection(request.payload);
    }
    throw new Error(`No canned answer for prompt ${promptName}`);
  }
}

async function bootstrap(): Promise<void> {
  console.log('[harness] Dropping and creating test database...');
  await withAdminClient(async (client) => {
    await client.query(`DROP DATABASE IF EXISTS "${TEST_DATABASE}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${TEST_DATABASE}"`);
  });

  process.env.DATABASE_URL = urlWithDatabase(`/${TEST_DATABASE}`);
  if (!process.env.REDIS_URL) {
    process.env.REDIS_URL = 'redis://127.0.0.1:6379/15';
  }

  console.log('[harness] Running migrations...');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  console.log('[harness] Booting NestJS application with mocked providers...');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AI_CLIENT)
    .useValue(aiClientMock)
    .overrideProvider(DEEPSEEK_ACCOUNT)
    .useValue(deepSeekAccountMock)
    .compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);

  await app.listen(PORT);

  console.log(`[harness] API listening on port ${String(PORT)}`);

  console.log('[harness] Booting worker module...');
  const workerModuleRef = await Test.createTestingModule({ imports: [WorkerModule] })
    .overrideProvider(AI_CLIENT)
    .useValue(aiClientMock)
    .overrideProvider(DEEPSEEK_ACCOUNT)
    .useValue(deepSeekAccountMock)
    .compile();

  const workerApp = workerModuleRef.createNestApplication();
  await workerApp.init();

  console.log('[harness] Worker module initialized');

  const shutdown = async (): Promise<void> => {
    console.log('[harness] Shutting down...');
    await workerApp.close();
    await app.close();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

void bootstrap().catch((error: unknown) => {
  console.error('[harness] Failed to start:', error);
  process.exit(1);
});
