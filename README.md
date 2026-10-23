# cv-adapter

Tailors your resume to one specific job posting with AI, using only what is already in your resume.
It runs on your own machine with Docker, and you bring your own DeepSeek API key.

The interface is in Brazilian Portuguese. The resume it writes follows the language of the job
posting, Portuguese or English.

## Who it is for

People applying to a lot of jobs with one resume: students, interns and juniors looking for their
first or next role, or anyone who keeps rewriting the same resume for every posting.

Most companies run applications through an ATS before a person reads them. The ATS has to parse your
file, and the recruiter searching it looks for the words the posting uses. A single generic resume
does badly at both. Tailoring it by hand for every posting takes an evening each time, and asking a
chatbot to do it tends to produce a resume with tools and numbers you never had, which falls apart
in the interview.

cv-adapter does the tailoring and keeps it honest: it can reorder, refocus and rewrite what you
already did, but it cannot add what you didn't.

## How it works

1. **Import your resume.** Upload a PDF. Your name and contact details are split off before
   anything is sent to the AI, and the rest becomes your career profile: each experience with the
   evidence lines behind it. You review and correct it before it is saved.
2. **Paste a job posting.** It is broken down into requirements, required and nice to have.
3. **See the match.** Each requirement is marked covered, partial or missing against your profile,
   with a match score.
4. **Get a tailored resume.** Every experience you have stays in, including the small ones. What
   changes is the focus, the order and the wording, aimed at a single A4 page.
5. **Review it.** See what changed, undo what you don't want, or ask the AI to rewrite a section
   the way you describe.
6. **Export the PDF.** One column, no photo, no tables, plain section titles, so an ATS can read it.
   The preview and the PDF come from the same template.

Imported resumes stay saved under **Meus currículos**. For the next posting you paste the job and
pick one of them, and the import step is skipped.

## What it will not do

The AI does not add numbers, tools, scale or job titles that are not in your own resume. Before a
generated line reaches the document, its numbers and names are checked against the evidence it came
from. A line that fails the check becomes a suggestion, and suggestions only reach the PDF after you
edit or approve them.

## Privacy

- Everything is stored in a local Postgres database, in a Docker volume on your machine.
- The only thing that leaves your machine is what goes to the DeepSeek API: your resume without your
  name and contact details, plus the job posting.
- Your DeepSeek key is typed into the app and stored in that same local database. It never goes in
  a file or an environment variable.
- There is no login. One instance belongs to one person, and every port is bound to `127.0.0.1`.
  Don't expose it to a network.
- **Configurações** lets you erase generated resumes or wipe all your data.

## Run it

You need:

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) on Windows or macOS, or Docker
  Engine with the Compose plugin on Linux.
- A DeepSeek API key with some credit, from [platform.deepseek.com](https://platform.deepseek.com).
  The AI cost is whatever DeepSeek charges on that key; cv-adapter charges nothing.
- Ports 3000, 3001, 5432 and 6379 free on `127.0.0.1`. A Postgres or Redis already running on your
  machine will conflict with the containers.

Then:

```bash
git clone https://github.com/GuilhermeDNobre/cv-adapter-prod.git
cd cv-adapter-prod
docker compose up --build
```

The first build takes a few minutes, because the `api` image includes Chromium for the PDF export.
When the logs settle, open http://localhost:3000.

There is no file to edit. The first screen asks for your DeepSeek key, checks it with DeepSeek
without spending credit, and saves it. From there the app walks you through the six steps above.
You can replace the key and see your balance later under **Configurações**.

| To | Run |
|---|---|
| Start again later | `docker compose up` |
| Stop | `docker compose stop` |
| Update to a newer version | `git pull`, then `docker compose up --build` |
| Delete all data | `docker compose down -v` |
| Read the logs | `docker compose logs -f api worker` |

## Stack

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces and Turborepo |
| Frontend | Next.js and TypeScript (`apps/web`) |
| Backend | NestJS (`apps/api`), with a BullMQ worker as a second entrypoint of the same image |
| Database | PostgreSQL 16 through Drizzle |
| Queue | Redis 7 |
| AI | DeepSeek-V4-Flash, official API |
| PDF in | `@firecrawl/pdf-inspector` |
| PDF out | Chromium via `playwright-core`, paginated by Paged.js, A4 |
| Tests | Vitest, plus Playwright and axe for the browser flow |

## Repository layout

| Path | What is there |
|---|---|
| `apps/web` | The Next.js app: import, review, job, match, tailoring, review and export screens |
| `apps/api` | The NestJS API (`src/main.ts`) and the queue worker (`src/main.worker.ts`) |
| `packages/schema` | Database schema, migrations and the request/response contracts both apps share |
| `packages/resume-templates` | The resume HTML/CSS used by both the preview and the PDF |
| `docs/adr` | Architecture decision records, in Portuguese |
| `CONTEXT.md` | Domain glossary, in Portuguese |

## Development

You need Node 22 and pnpm (`corepack enable` picks the version pinned in `package.json`).

```bash
docker compose up -d postgres redis
pnpm install
pnpm lint
pnpm type-check
pnpm test
```

Integration tests use the two containers above. Tests connect to `127.0.0.1`, never `localhost`:
on Windows `localhost` resolves to IPv6 first and the containers only listen on IPv4.

The PDF tests in `apps/api` need Playwright's Chromium:

```bash
./apps/api/node_modules/.bin/playwright-core install chromium
```

The browser tests live in `apps/web/e2e` and need no DeepSeek key; the harness fakes the AI:

```bash
pnpm --filter web exec playwright install chromium
pnpm --filter web test:e2e
```

On a machine short on memory, run one package at a time with fewer workers, for example
`pnpm --filter api exec vitest run --maxWorkers=2`.

## Bugs and ideas

Open an issue. It is a side project, so fixes come as I find time.

## License

[MIT](LICENSE)
