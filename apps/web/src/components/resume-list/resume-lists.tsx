'use client';

import type { ResumeListItem } from 'schema/contracts/resume';
import { buttonClasses } from '../button';
import { Card } from '../ui/card';
import { ResumeListItemView } from './resume-list-item';

const NEW_RESUME_ROUTE = '/curriculos/novo';

function vacancyTitle(group: readonly ResumeListItem[]): string {
  const titled = group.find((resume) => resume.jobTitle !== null);
  if (titled?.jobTitle !== undefined && titled.jobTitle !== null && titled.jobTitle.trim() !== '') {
    return titled.jobTitle;
  }
  return 'Vaga sem identificação';
}

interface TailoredGroup {
  readonly jobDescriptionId: string | null;
  readonly resumes: ResumeListItem[];
}

function groupTailoredByVacancy(resumes: readonly ResumeListItem[]): TailoredGroup[] {
  const groups = new Map<string | null, ResumeListItem[]>();
  for (const resume of resumes) {
    if (resume.kind !== 'tailored') continue;
    const group = groups.get(resume.jobDescriptionId) ?? [];
    group.push(resume);
    groups.set(resume.jobDescriptionId, group);
  }
  return [...groups.entries()].map(([jobDescriptionId, group]) => ({
    jobDescriptionId,
    resumes: group,
  }));
}

export function EmptyResumes(): React.JSX.Element {
  return (
    <Card className="flex flex-col gap-4 p-6">
      <section aria-label="Nenhum currículo ainda" className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold tracking-[-0.01em] text-text">
          Nenhum currículo ainda
        </h2>
        <p className="text-text-2">
          Um Base Resume é a seleção curada do seu Career Profile de onde cada candidatura parte:
          com Template, ordem e redação próprios. Crie o primeiro para depois gerar um currículo por
          vaga.
        </p>
        <a href={NEW_RESUME_ROUTE} className={`${buttonClasses('primary', 'md')} w-fit`}>
          Criar primeiro Base Resume
        </a>
      </section>
    </Card>
  );
}

interface ResumeListsProps {
  readonly resumes: readonly ResumeListItem[];
  readonly onDeleted: (resumeId: string) => void;
}

export function ResumeLists({ resumes, onDeleted }: ResumeListsProps): React.JSX.Element {
  const baseResumes = resumes.filter((resume) => resume.kind === 'base');
  const tailoredGroups = groupTailoredByVacancy(resumes);
  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Base Resumes" className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-[-0.01em] text-text">Base Resumes</h2>
        {baseResumes.length === 0 ? (
          <p className="text-text-2">Nenhum Base Resume ainda.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {baseResumes.map((resume) => (
              <ResumeListItemView key={resume.id} resume={resume} onDeleted={onDeleted} />
            ))}
          </ul>
        )}
        <a href={NEW_RESUME_ROUTE} className={`${buttonClasses('primary', 'md')} w-fit`}>
          Criar Base Resume
        </a>
      </section>
      <section aria-label="Tailored Resumes por vaga" className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold tracking-[-0.01em] text-text">
          Tailored Resumes por vaga
        </h2>
        {tailoredGroups.length === 0 ? (
          <p className="text-text-2">
            Nenhum Tailored Resume ainda. Ele nasce de um Base Resume mais uma vaga.
          </p>
        ) : (
          tailoredGroups.map((group) => {
            const title = vacancyTitle(group.resumes);
            return (
              <section
                key={group.jobDescriptionId ?? 'without-vacancy'}
                aria-label={title}
                className="flex flex-col gap-3"
              >
                <h3 className="text-sm font-semibold text-text">{title}</h3>
                <ul className="flex flex-col gap-3">
                  {group.resumes.map((resume) => (
                    <ResumeListItemView key={resume.id} resume={resume} onDeleted={onDeleted} />
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </section>
    </div>
  );
}
