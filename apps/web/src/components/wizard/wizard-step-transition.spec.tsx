'use client';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WizardStepTransition } from './wizard-step-transition';

const pathnameState = vi.hoisted(() => ({ pathname: '/vaga' }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameState.pathname,
}));

describe('WizardStepTransition', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    pathnameState.pathname = '/vaga';
  });

  it('should show the step content immediately without waiting for the animation to end', () => {
    render(
      <WizardStepTransition>
        <p>Step body.</p>
      </WizardStepTransition>,
    );

    expect(screen.getByText('Step body.')).toBeInTheDocument();
  });

  it('should call scrollTo and focus the h1 when the route changes', () => {
    const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    pathnameState.pathname = '/vaga';
    const { rerender } = render(
      <WizardStepTransition>
        <main>
          <h1>Step title</h1>
        </main>
      </WizardStepTransition>,
    );
    expect(scrollSpy).not.toHaveBeenCalled();

    pathnameState.pathname = '/adaptar';
    rerender(
      <WizardStepTransition>
        <main>
          <h1>Step title</h1>
        </main>
      </WizardStepTransition>,
    );

    expect(scrollSpy).toHaveBeenCalledWith(0, 0);
    const heading = screen.getByRole('heading', { name: 'Step title' });
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(heading);
  });
});
