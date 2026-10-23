'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Upload } from 'lucide-react';
import { ApiError, getCareerProfile } from '../../lib/api-client';
import { buttonClasses } from '../button';
import { Card } from '../ui/card';

const HTTP_NOT_FOUND = 404;
const UPLOAD_ROUTE = '/importacao';

type ProfileState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'fresh' }
  | { readonly kind: 'returning' }
  | { readonly kind: 'unknown' };

function baseCountSuffix(baseCount: number | null): string {
  if (baseCount === null || baseCount === 0) return '';
  return ` Você já tem ${String(baseCount)} Base Resume${baseCount === 1 ? '' : 's'}.`;
}

function uploadMessageFor(profile: ProfileState, baseCount: number | null): string {
  if (profile.kind === 'loading') return 'Verificando seu Career Profile.';
  if (profile.kind === 'unknown') {
    return (
      'Enviar currículo lê seu arquivo para montar ou juntar ao seu Career Profile. ' +
      'Você confere tudo antes de aprovar.'
    );
  }
  if (profile.kind === 'fresh') {
    return (
      'Enviar currículo cria seu Career Profile e um Base Resume novo a partir do arquivo. ' +
      'Você confere tudo antes de aprovar.'
    );
  }
  return (
    'Você já tem Career Profile. Enviar outro currículo junta ao existente sem duplicar e ' +
    `oferece criar um Base Resume novo a partir desse arquivo.${baseCountSuffix(baseCount)}`
  );
}

interface ResumeUploadPanelProps {
  readonly baseCount: number | null;
}

export function ResumeUploadPanel({ baseCount }: ResumeUploadPanelProps): React.JSX.Element {
  const headingId = useId();
  const [profile, setProfile] = useState<ProfileState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await getCareerProfile();
        if (!cancelled) setProfile({ kind: 'returning' });
      } catch (error: unknown) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === HTTP_NOT_FOUND) {
          setProfile({ kind: 'fresh' });
          return;
        }
        console.error('resume_upload_panel.profile_failed', {
          status: error instanceof ApiError ? error.status : null,
        });
        setProfile({ kind: 'unknown' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
      <section aria-labelledby={headingId} className="flex min-w-0 max-w-[640px] items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent-text"
        >
          <Upload size={20} strokeWidth={1.6} aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={headingId} className="text-base font-semibold tracking-[-0.01em] text-text">
            Enviar um currículo
          </h2>
          <p className="text-sm text-text-2">{uploadMessageFor(profile, baseCount)}</p>
        </div>
      </section>
      <Link href={UPLOAD_ROUTE} className={`${buttonClasses('primary', 'md')} w-fit`}>
        Enviar currículo
      </Link>
    </Card>
  );
}
