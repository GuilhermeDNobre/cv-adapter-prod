'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { WizardStepper } from './wizard-stepper';
import { isResumeAreaPath } from './wizard-route';

interface HeaderTitleProps {
  readonly kicker: string;
  readonly title: string;
}

function HeaderTitle({ kicker, title }: HeaderTitleProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-text-3">{kicker}</span>
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-text">{title}</span>
    </div>
  );
}

export function FunnelHeader(): React.JSX.Element {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (isResumeAreaPath(pathname, searchParams.get('vaga'))) {
    return <HeaderTitle kicker="Meus currículos" title="Enviar currículo" />;
  }
  return (
    <>
      <HeaderTitle kicker="Adaptação" title="Nova adaptação" />
      <WizardStepper />
    </>
  );
}
