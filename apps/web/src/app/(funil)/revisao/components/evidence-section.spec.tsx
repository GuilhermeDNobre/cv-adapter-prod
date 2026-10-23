import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EvidenceSection } from './evidence-section';

describe('EvidenceSection', () => {
  it('should render a long evidence in a textarea with an accessible remove button', () => {
    const statement =
      'Liderei uma equipe com cinco pessoas e entreguei o projeto no prazo com React, Node.js e Docker.';
    render(
      <EvidenceSection
        evidences={[{ statement }]}
        experienceLabels={[]}
        onChangeEvidence={() => undefined}
        onCommitEvidence={() => undefined}
        onAddEvidence={() => undefined}
        onRemoveEvidence={() => undefined}
      />,
    );

    const field = screen.getByLabelText('O que você fez ou conquistou') as HTMLTextAreaElement;
    expect(field.tagName.toLowerCase()).toBe('textarea');
    expect(field).toHaveValue(statement);
  });

  it('should not style the remove button with bg-accent', () => {
    const onRemoveEvidence = vi.fn();
    render(
      <EvidenceSection
        evidences={[{ statement: 'Did something.' }]}
        experienceLabels={[]}
        onChangeEvidence={() => undefined}
        onCommitEvidence={() => undefined}
        onAddEvidence={() => undefined}
        onRemoveEvidence={onRemoveEvidence}
      />,
    );

    const remove = screen.getByRole('button', { name: 'Remover Evidence 1' });
    expect(remove.className).not.toContain('bg-accent');

    fireEvent.click(remove);
    expect(onRemoveEvidence).toHaveBeenCalledWith(0);
  });
});
