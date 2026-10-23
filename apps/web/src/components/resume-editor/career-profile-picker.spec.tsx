import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { CareerProfileResponse } from '../../lib/api-client';
import { CareerProfilePicker, type ProfileSelection } from './career-profile-picker';

const EXPERIENCE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const EDUCATION_ID = '11111111-1111-4111-8111-111111111111';
const EVIDENCE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const UNLINKED_EVIDENCE_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddde';

function profileFixture(): CareerProfileResponse {
  return {
    experiences: [
      {
        id: EXPERIENCE_ID,
        company: 'Acme',
        role: 'Backend Engineer',
        startedOn: '2020-01',
        endedOn: null,
      },
    ],
    educationEntries: [
      {
        id: EDUCATION_ID,
        institution: 'UFPE',
        degree: 'Computer Science',
        startedOn: '2016-01',
        endedOn: '2019-12',
      },
    ],
    evidences: [
      { id: EVIDENCE_ID, statement: 'Cut latency by 30%.', experienceId: EXPERIENCE_ID },
      {
        id: UNLINKED_EVIDENCE_ID,
        statement: 'Mentored interns.',
        experienceId: null,
      },
    ],
  };
}

function lastSelection(onChange: ReturnType<typeof vi.fn>): ProfileSelection {
  const calls = onChange.mock.calls;
  const last = calls[calls.length - 1];
  if (last === undefined) throw new Error('Expected the picker to report a selection');
  return last[0] as ProfileSelection;
}

function openGroup(namePattern: RegExp): void {
  const trigger = screen.getByRole('button', { name: namePattern });
  if (trigger.getAttribute('aria-expanded') === 'false') {
    fireEvent.click(trigger);
  }
}

describe('CareerProfilePicker', () => {
  it('should start with every experience, formation and evidence checked', () => {
    const onChange = vi.fn();
    render(
      <CareerProfilePicker
        profile={profileFixture()}
        showExperience
        showEducation
        showSummary
        showSkills={false}
        showCustom={false}
        onChange={onChange}
      />,
    );

    openGroup(/Experiências na Section Experience/);
    openGroup(/Formação na Section Education/);
    openGroup(/Evidences que alimentam o Summary/);
    openGroup(/Evidences de Backend Engineer na Acme/);

    expect(screen.getByRole('checkbox', { name: 'Backend Engineer na Acme (2020-01 – atual)' })).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: /Computer Science na UFPE/ }),
    ).toBeChecked();
    const experienceGroup = screen.getByRole('group', {
      name: 'Evidences de Backend Engineer na Acme',
    });
    expect(
      within(experienceGroup).getByRole('checkbox', { name: 'Cut latency by 30%.' }),
    ).toBeChecked();
    const summaryGroup = screen.getByRole('group', { name: 'Evidences que alimentam o Summary' });
    expect(
      within(summaryGroup).getByRole('checkbox', { name: 'Cut latency by 30%.' }),
    ).toBeChecked();
    const selection = lastSelection(onChange);
    expect(selection.experienceIds).toEqual([EXPERIENCE_ID]);
    expect(selection.educationEntryIds).toEqual([EDUCATION_ID]);
    expect(selection.summaryEvidenceIds).toEqual([EVIDENCE_ID, UNLINKED_EVIDENCE_ID]);
    expect(selection.experienceEvidenceIds).toEqual([EVIDENCE_ID]);
  });

  it('should list the linked evidences under each checked experience, all checked', () => {
    const onChange = vi.fn();
    render(
      <CareerProfilePicker
        profile={profileFixture()}
        showExperience
        showEducation={false}
        showSummary={false}
        showSkills={false}
        showCustom={false}
        onChange={onChange}
      />,
    );

    openGroup(/Evidences de Backend Engineer na Acme/);

    const group = screen.getByRole('group', {
      name: 'Evidences de Backend Engineer na Acme',
    });
    expect(within(group).getByRole('checkbox', { name: 'Cut latency by 30%.' })).toBeChecked();
    expect(within(group).queryByRole('checkbox', { name: 'Mentored interns.' })).not.toBeInTheDocument();
    expect(lastSelection(onChange).experienceEvidenceIds).toEqual([EVIDENCE_ID]);
  });

  it('should drop an unchecked experience evidence from the selection', () => {
    const onChange = vi.fn();
    render(
      <CareerProfilePicker
        profile={profileFixture()}
        showExperience
        showEducation={false}
        showSummary={false}
        showSkills={false}
        showCustom={false}
        onChange={onChange}
      />,
    );

    openGroup(/Evidences de Backend Engineer na Acme/);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Cut latency by 30%.' }));

    expect(lastSelection(onChange).experienceEvidenceIds).toEqual([]);
  });

  it('should report the unchecked experience as excluded', () => {
    const onChange = vi.fn();
    render(
      <CareerProfilePicker
        profile={profileFixture()}
        showExperience
        showEducation={false}
        showSummary={false}
        showSkills={false}
        showCustom={false}
        onChange={onChange}
      />,
    );

    openGroup(/Experiências na Section Experience/);
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Backend Engineer na Acme (2020-01 – atual)' }),
    );

    expect(lastSelection(onChange).experienceIds).toEqual([]);
  });

  it('should keep summary and skills evidence selections independent', () => {
    const onChange = vi.fn();
    render(
      <CareerProfilePicker
        profile={profileFixture()}
        showExperience={false}
        showEducation={false}
        showSummary
        showSkills
        showCustom={false}
        onChange={onChange}
      />,
    );

    openGroup(/Evidences que alimentam o Summary/);
    const summaryGroup = screen.getByRole('group', { name: 'Evidences que alimentam o Summary' });
    const summaryBox = within(summaryGroup).getByRole('checkbox', {
      name: 'Cut latency by 30%.',
    });
    fireEvent.click(summaryBox);

    const selection = lastSelection(onChange);
    expect(selection.summaryEvidenceIds).toEqual([UNLINKED_EVIDENCE_ID]);
    expect(selection.skillsEvidenceIds).toEqual([EVIDENCE_ID, UNLINKED_EVIDENCE_ID]);
  });

  it('should collect handwritten custom items and allow removing one', () => {
    const onChange = vi.fn();
    render(
      <CareerProfilePicker
        profile={profileFixture()}
        showExperience={false}
        showEducation={false}
        showSummary={false}
        showSkills={false}
        showCustom
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar item' }));
    fireEvent.change(screen.getByLabelText('Item 1'), { target: { value: 'Best paper award' } });
    fireEvent.change(screen.getByLabelText('Item 2'), { target: { value: 'Keynote 2024' } });

    expect(lastSelection(onChange).customItems).toEqual(['Best paper award', 'Keynote 2024']);

    fireEvent.click(screen.getByRole('button', { name: 'Remover item 1' }));

    expect(lastSelection(onChange).customItems).toEqual(['Keynote 2024']);
  });

  it('should keep every checklist group collapsed with N de M marcadas in the header', () => {
    render(
      <CareerProfilePicker
        profile={profileFixture()}
        showExperience
        showEducation
        showSummary
        showSkills
        showCustom={false}
        onChange={vi.fn()}
      />,
    );

    const triggers = screen.getAllByRole('button', { expanded: false });
    expect(triggers.length).toBe(5);
    for (const trigger of triggers) {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).toHaveAttribute('aria-controls');
      const controlsId = trigger.getAttribute('aria-controls');
      expect(controlsId).not.toBeNull();
    }
    expect(
      screen.getByRole('button', { name: /Experiências na Section Experience.*1 de 1 marcada/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Evidences de Backend Engineer na Acme.*1 de 1 marcada/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Formação na Section Education.*1 de 1 marcada/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Evidences que alimentam o Summary.*2 de 2 marcadas/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Evidences que alimentam o Skills.*2 de 2 marcadas/ }),
    ).toBeInTheDocument();
  });

  it('should update the header count when an item is unchecked', () => {
    const onChange = vi.fn();
    render(
      <CareerProfilePicker
        profile={profileFixture()}
        showExperience={false}
        showEducation={false}
        showSummary
        showSkills={false}
        showCustom={false}
        onChange={onChange}
      />,
    );

    expect(
      screen.getByRole('button', { name: /Evidences que alimentam o Summary.*2 de 2 marcadas/ }),
    ).toBeInTheDocument();

    openGroup(/Evidences que alimentam o Summary/);
    const summaryGroup = screen.getByRole('group', {
      name: 'Evidences que alimentam o Summary',
    });
    fireEvent.click(
      within(summaryGroup).getByRole('checkbox', { name: 'Cut latency by 30%.' }),
    );

    expect(
      screen.getByRole('button', { name: /Evidences que alimentam o Summary.*1 de 2 marcadas/ }),
    ).toBeInTheDocument();
    expect(lastSelection(onChange).summaryEvidenceIds).toEqual([UNLINKED_EVIDENCE_ID]);
  });

  it('should keep the checkboxes inside the opened group', () => {
    render(
      <CareerProfilePicker
        profile={profileFixture()}
        showExperience
        showEducation={false}
        showSummary={false}
        showSkills={false}
        showCustom={false}
        onChange={vi.fn()}
      />,
    );

    const triggers = screen.getAllByRole('button', { expanded: false });
    expect(triggers.length).toBe(2);
    for (const trigger of triggers) {
      fireEvent.click(trigger);
    }

    expect(screen.getAllByRole('button', { expanded: true }).length).toBe(2);
    expect(
      screen.getByRole('checkbox', {
        name: 'Backend Engineer na Acme (2020-01 – atual)',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', {
        name: 'Cut latency by 30%.',
      }),
    ).toBeInTheDocument();
  });

  it('should not render an empty group', () => {
    render(
      <CareerProfilePicker
        profile={{ experiences: [], educationEntries: [], evidences: [] }}
        showExperience
        showEducation
        showSummary
        showSkills
        showCustom={false}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { expanded: false })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { expanded: true })).not.toBeInTheDocument();
    expect(screen.queryByText(/Nada para escolher/)).not.toBeInTheDocument();
    expect(screen.queryByText(/marcadas/)).not.toBeInTheDocument();
  });

  it('should rotate the group chevron with aria-expanded', () => {
    render(
      <CareerProfilePicker
        profile={profileFixture()}
        showExperience={false}
        showEducation={false}
        showSummary
        showSkills={false}
        showCustom={false}
        onChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('button', {
      name: /Evidences que alimentam o Summary/,
    });
    const chevron = within(trigger).getByTestId('group-chevron');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(chevron.style.transform).toBe('rotate(0deg)');

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(chevron.style.transform).toBe('rotate(90deg)');

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(chevron.style.transform).toBe('rotate(0deg)');
  });

  it('should mark the group box indeterminate when the selection is partial', () => {
    const onChange = vi.fn();
    render(
      <CareerProfilePicker
        profile={profileFixture()}
        showExperience={false}
        showEducation={false}
        showSummary
        showSkills={false}
        showCustom={false}
        onChange={onChange}
      />,
    );

    const groupBox = screen.getByRole('checkbox', {
      name: 'Marcar todas as Evidences que alimentam o Summary',
    });
    expect(groupBox).not.toHaveAttribute('aria-checked', 'mixed');
    expect(groupBox).toBeChecked();

    openGroup(/Evidences que alimentam o Summary/);
    const summaryGroup = screen.getByRole('group', {
      name: 'Evidences que alimentam o Summary',
    });
    fireEvent.click(
      within(summaryGroup).getByRole('checkbox', { name: 'Cut latency by 30%.' }),
    );

    expect(groupBox).toHaveAttribute('aria-checked', 'mixed');
    expect(
      screen.getByRole('button', { name: /Evidences que alimentam o Summary.*1 de 2 marcadas/ }),
    ).toBeInTheDocument();
  });

  it('should select all through the indeterminate group box and unselect on the next click', () => {
    const onChange = vi.fn();
    render(
      <CareerProfilePicker
        profile={profileFixture()}
        showExperience={false}
        showEducation={false}
        showSummary
        showSkills={false}
        showCustom={false}
        onChange={onChange}
      />,
    );

    openGroup(/Evidences que alimentam o Summary/);
    const summaryGroup = screen.getByRole('group', {
      name: 'Evidences que alimentam o Summary',
    });
    fireEvent.click(
      within(summaryGroup).getByRole('checkbox', { name: 'Cut latency by 30%.' }),
    );
    expect(lastSelection(onChange).summaryEvidenceIds).toEqual([UNLINKED_EVIDENCE_ID]);

    const groupBox = screen.getByRole('checkbox', {
      name: 'Marcar todas as Evidences que alimentam o Summary',
    });
    fireEvent.click(groupBox);
    expect(lastSelection(onChange).summaryEvidenceIds).toEqual([
      EVIDENCE_ID,
      UNLINKED_EVIDENCE_ID,
    ]);

    fireEvent.click(groupBox);
    expect(lastSelection(onChange).summaryEvidenceIds).toEqual([]);
  });

  it('should keep collapsing the group without changing the selection', () => {
    const onChange = vi.fn();
    render(
      <CareerProfilePicker
        profile={profileFixture()}
        showExperience={false}
        showEducation={false}
        showSummary
        showSkills={false}
        showCustom={false}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole('button', {
      name: /Evidences que alimentam o Summary/,
    });
    fireEvent.click(trigger);
    fireEvent.click(trigger);

    expect(lastSelection(onChange).summaryEvidenceIds).toEqual([
      EVIDENCE_ID,
      UNLINKED_EVIDENCE_ID,
    ]);
    expect(
      screen.getByRole('button', { name: /Evidences que alimentam o Summary.*2 de 2 marcadas/ }),
    ).toBeInTheDocument();
  });
});
