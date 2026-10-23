import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { SkillsSection } from './skills-section';

const GROUPED_SKILLS = [
  { name: 'React', group: 'Front-end' },
  { name: 'Node.js', group: 'Back-end' },
];

function renderGrouped(onMoveSkill: (index: number, group: string | null) => void): void {
  render(
    <SkillsSection
      skills={GROUPED_SKILLS}
      onAddSkill={() => undefined}
      onRemoveSkill={() => undefined}
      onMoveSkill={onMoveSkill}
    />,
  );
}

function dropOn(groupTestId: string, indexText: string): void {
  fireEvent.drop(screen.getByTestId(groupTestId), {
    dataTransfer: { getData: (): string => indexText },
  });
}

describe('SkillsSection', () => {
  it('should render the counter next to the title', () => {
    render(
      <SkillsSection
        skills={[
          { name: 'React', group: null },
          { name: 'Node.js', group: null },
        ]}
        onAddSkill={() => undefined}
        onRemoveSkill={() => undefined}
        onMoveSkill={() => undefined}
      />,
    );
    expect(screen.getByRole('region', { name: 'Habilidades' })).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('Node.js')).toBeInTheDocument();
  });
  it('should remove a skill through a labeled chip button', () => {
    const onRemoveSkill = vi.fn();
    render(
      <SkillsSection
        skills={[{ name: 'Kubernetes', group: null }]}
        onAddSkill={() => undefined}
        onRemoveSkill={onRemoveSkill}
        onMoveSkill={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remover Kubernetes' }));
    expect(onRemoveSkill).toHaveBeenCalledWith(0);
  });
  it('should add a skill from the input', () => {
    const onAddSkill = vi.fn();
    render(
      <SkillsSection skills={[]} onAddSkill={onAddSkill} onRemoveSkill={() => undefined} onMoveSkill={() => undefined} />,
    );
    fireEvent.change(screen.getByLabelText('Nova habilidade'), {
      target: { value: 'Kubernetes' },
    });
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar' }));
    expect(onAddSkill).toHaveBeenCalledWith({ name: 'Kubernetes', group: null });
  });
  it('should group chips under the group name with ungrouped last as Habilidades', () => {
    render(
      <SkillsSection
        skills={[
          { name: 'React', group: 'Front-end' },
          { name: 'PostgreSQL', group: null },
          { name: 'Node.js', group: 'Back-end' },
        ]}
        onAddSkill={() => undefined}
        onRemoveSkill={() => undefined}
        onMoveSkill={() => undefined}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Front-end' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Back-end' })).toBeInTheDocument();
    expect(within(screen.getByTestId('skill-group-ungrouped')).getByRole('heading', { name: 'Habilidades' })).toBeInTheDocument();
    expect(screen.queryByText('Outras')).not.toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('Node.js')).toBeInTheDocument();
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
  });
  it('should move a chip to another group through drag and drop', () => {
    const onMoveSkill = vi.fn();
    renderGrouped(onMoveSkill);
    const chip = screen.getByText('React').closest('li');
    expect(chip).not.toBeNull();
    fireEvent.dragStart(chip as HTMLElement, { dataTransfer: { setData: vi.fn() } });
    const target = screen.getByTestId('skill-group-Back-end');
    fireEvent.dragOver(target);
    expect(target.className).toContain('bg-accent-soft');
    dropOn('skill-group-Back-end', '0');
    expect(onMoveSkill).toHaveBeenCalledWith(0, 'Back-end');
  });
  it('should ignore a drop on the chip’s own group', () => {
    const onMoveSkill = vi.fn();
    renderGrouped(onMoveSkill);
    const chip = screen.getByText('React').closest('li');
    expect(chip).not.toBeNull();
    fireEvent.dragStart(chip as HTMLElement, { dataTransfer: { setData: vi.fn() } });
    dropOn('skill-group-Front-end', '0');
    expect(onMoveSkill).not.toHaveBeenCalled();
  });
  it('should move a chip through the Mover menu', async () => {
    const onMoveSkill = vi.fn();
    renderGrouped(onMoveSkill);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mover React para outro grupo' }));
    });
    const option = await screen.findByRole('button', { name: 'Back-end' });
    await act(async () => {
      fireEvent.click(option);
    });
    expect(onMoveSkill).toHaveBeenCalledWith(0, 'Back-end');
  });
  it('should add a new skill to the group chosen in the select', () => {
    const onAddSkill = vi.fn();
    render(
      <SkillsSection
        skills={GROUPED_SKILLS}
        onAddSkill={onAddSkill}
        onRemoveSkill={() => undefined}
        onMoveSkill={() => undefined}
      />,
    );
    expect(screen.getByLabelText('Grupo')).toHaveValue('Front-end');
    fireEvent.change(screen.getByLabelText('Grupo'), { target: { value: 'Back-end' } });
    fireEvent.change(screen.getByLabelText('Nova habilidade'), { target: { value: 'Kubernetes' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar' }));
    expect(onAddSkill).toHaveBeenCalledWith({ name: 'Kubernetes', group: 'Back-end' });
  });
  it('should default a new skill to no group when there are no groups', () => {
    const onAddSkill = vi.fn();
    render(
      <SkillsSection skills={[]} onAddSkill={onAddSkill} onRemoveSkill={() => undefined} onMoveSkill={() => undefined} />,
    );
    expect(screen.getByLabelText('Grupo')).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Sem grupo' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nova habilidade'), { target: { value: 'Kubernetes' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar' }));
    expect(onAddSkill).toHaveBeenCalledWith({ name: 'Kubernetes', group: null });
  });
});
