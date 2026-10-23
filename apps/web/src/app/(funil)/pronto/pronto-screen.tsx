'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Check } from 'lucide-react';
import { buttonClasses } from '../../../components/button';
import { StatusRegion } from '../../../components/status-region';
import { resumeStepHref } from '../../../components/wizard/wizard-route';
import { EASE_OUT, STEP_ENTER_MS } from '../../../lib/motion';

const APPROVED_ANNOUNCEMENT = 'Base Resume aprovado.';
const NEXT_STEP_MESSAGE =
  'O Career Profile e o Base Resume estão salvos. Agora é só colar o anúncio de uma vaga para ver ' +
  'o encaixe e gerar um currículo adaptado a ela.';
const FLOW_NEXT_STEP_MESSAGE =
  'O Career Profile e o Base Resume estão salvos. Continue a adaptação para ver o encaixe com a ' +
  'vaga que você colou e gerar o currículo adaptado a ela.';

interface ProntoScreenProps {
  readonly resumeId?: string;
  readonly jobDescriptionId?: string;
  readonly fileName?: string;
}

interface PrimaryAction {
  readonly href: string;
  readonly label: string;
  readonly message: string;
}

function timeLabel(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `Aprovado hoje às ${hours}:${minutes}`;
}

function primaryActionFor(resumeId?: string, jobDescriptionId?: string): PrimaryAction {
  if (jobDescriptionId === undefined || jobDescriptionId === '') {
    return { href: '/vaga', label: 'Colar a primeira vaga →', message: NEXT_STEP_MESSAGE };
  }
  return {
    href: resumeStepHref({ jobDescriptionId, baseResumeId: resumeId }),
    label: 'Continuar a adaptação',
    message: FLOW_NEXT_STEP_MESSAGE,
  };
}

export function ProntoScreen({ resumeId, jobDescriptionId, fileName }: ProntoScreenProps): React.JSX.Element {
  const primaryRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    primaryRef.current?.focus();
  }, []);
  const primary = primaryActionFor(resumeId, jobDescriptionId);
  const resumeHref =
    resumeId !== undefined && resumeId !== '' ? `/curriculos/${resumeId}` : '/curriculos';
  const sourceLabel = fileName !== undefined && fileName !== '' ? fileName : 'arquivo enviado';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: STEP_ENTER_MS / 1000, ease: EASE_OUT }}
      className="flex flex-col items-center gap-5 rounded-xl border border-border bg-surface p-8 text-center shadow"
    >
      <StatusRegion>{APPROVED_ANNOUNCEMENT}</StatusRegion>
      <span
        aria-hidden="true"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent-text"
      >
        <Check size={22} strokeWidth={2} aria-hidden="true" />
      </span>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-text">Seu currículo base está pronto</h1>
        <p className="text-sm text-text-2">{primary.message}</p>
      </header>
      <ul className="flex w-full flex-col gap-3 rounded-[10px] border border-border bg-surface-2 p-4 text-left">
        <li className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-semibold text-text">Career Profile</span>
            <span className="truncate text-[13px] text-text-2">
              {`Montado a partir de ${sourceLabel}`}
            </span>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ok-soft px-2.5 py-1 text-xs font-semibold text-ok">
            <Check size={12} strokeWidth={2.2} aria-hidden="true" />
            Salvo
          </span>
        </li>
        <li className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-semibold text-text">Base Resume</span>
            <span className="text-[13px] text-text-2">{timeLabel()}</span>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ok-soft px-2.5 py-1 text-xs font-semibold text-ok">
            <Check size={12} strokeWidth={2.2} aria-hidden="true" />
            Aprovado
          </span>
        </li>
      </ul>
      <div className="flex flex-wrap justify-center gap-3">
        <a ref={primaryRef} href={primary.href} className={`${buttonClasses('primary', 'md')} w-fit`}>
          {primary.label}
        </a>
        <a href={resumeHref} className={`${buttonClasses('secondary', 'md')} w-fit`}>
          Ver meu Base Resume
        </a>
      </div>
      <p className="text-xs text-text-3">Os dois continuam editáveis em Currículos.</p>
    </motion.div>
  );
}
