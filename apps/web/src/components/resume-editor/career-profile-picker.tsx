'use client';

import { useEffect, useId, useState } from 'react';
import { Collapsible } from 'radix-ui';
import { ChevronRight } from 'lucide-react';
import type { CareerProfileResponse } from '../../lib/api-client';
import { Button } from '../button';
import { LabeledInput } from '../labeled-input';
import { Card } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import { CHEVRON_MS, ms } from '../../lib/motion';

export interface ProfileSelection {
  readonly experienceIds: string[];
  readonly educationEntryIds: string[];
  readonly summaryEvidenceIds: string[];
  readonly skillsEvidenceIds: string[];
  readonly experienceEvidenceIds: string[];
  readonly customItems: string[];
}

function allIds(ids: readonly string[]): string[] {
  return [...ids];
}

function toggleId(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id];
}

function describePeriod(startedOn: string | null, endedOn: string | null): string {
  if (startedOn === null) return '';
  return endedOn === null ? `${startedOn} – atual` : `${startedOn} – ${endedOn}`;
}

interface ChecklistItem {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
}

interface ItemChecklistProps {
  readonly legend: string;
  readonly items: ReadonlyArray<ChecklistItem>;
  readonly selected: readonly string[];
  readonly onToggle: (id: string) => void;
  readonly onToggleAll: (next: boolean) => void;
}

function formatMarkedCount(selectedCount: number, total: number): string {
  if (total === 1) return `${String(selectedCount)} de ${String(total)} marcada`;
  return `${String(selectedCount)} de ${String(total)} marcadas`;
}

function ItemChecklist({
  legend,
  items,
  selected,
  onToggle,
  onToggleAll,
}: ItemChecklistProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  if (items.length === 0) return null;
  const enabled = items.filter((item) => item.disabled !== true);
  const total = enabled.length === 0 ? items.length : enabled.length;
  const countable = enabled.length === 0 ? items : enabled;
  const selectedCount = countable.filter((item) => selected.includes(item.id)).length;
  const allChecked = countable.length > 0 && selectedCount === countable.length;
  const someChecked = selectedCount > 0 && selectedCount < countable.length;
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="flex flex-col">
      <div className="flex items-center gap-1 px-2">
        <Checkbox
          checked={allChecked}
          indeterminate={someChecked}
          ariaLabel={`Marcar todas as ${legend}`}
          onChange={onToggleAll}
        />
        <Collapsible.Trigger
          aria-controls={contentId}
          className="flex flex-1 items-center gap-2 rounded-md px-2 py-[14px] text-left text-sm font-semibold text-text hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
        >
          <span
            data-testid="group-chevron"
            aria-hidden="true"
            className="flex shrink-0 text-text-2"
            style={{
              transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: `transform ${ms(CHEVRON_MS)} ease-out`,
            }}
          >
            <ChevronRight size={16} strokeWidth={1.6} aria-hidden="true" />
          </span>
          <span className="flex-1 text-sm font-semibold text-text">{legend}</span>
          <span className="text-xs font-medium tabular-nums text-text-3">
            {formatMarkedCount(selectedCount, total)}
          </span>
        </Collapsible.Trigger>
      </div>
      <Collapsible.Content id={contentId} className="flex flex-col px-4 pb-4">
        <fieldset className="flex flex-col gap-1">
          <legend className="sr-only">{legend}</legend>
          {items.map((item) => (
            <Checkbox
              key={item.id}
              checked={selected.includes(item.id)}
              disabled={item.disabled}
              disabledReason={item.disabledReason}
              label={item.label}
              onChange={() => onToggle(item.id)}
            />
          ))}
        </fieldset>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

interface CareerProfilePickerProps {
  readonly profile: CareerProfileResponse;
  readonly showExperience: boolean;
  readonly showEducation: boolean;
  readonly showSummary: boolean;
  readonly showSkills: boolean;
  readonly showCustom: boolean;
  readonly onChange: (selection: ProfileSelection) => void;
}

export function CareerProfilePicker({
  profile,
  showExperience,
  showEducation,
  showSummary,
  showSkills,
  showCustom,
  onChange,
}: CareerProfilePickerProps): React.JSX.Element {
  const [experienceIds, setExperienceIds] = useState<string[]>(() =>
    allIds(profile.experiences.map((entry) => entry.id)),
  );
  const [educationEntryIds, setEducationEntryIds] = useState<string[]>(() =>
    allIds(profile.educationEntries.map((entry) => entry.id)),
  );
  const [summaryEvidenceIds, setSummaryEvidenceIds] = useState<string[]>(() =>
    allIds(profile.evidences.map((entry) => entry.id)),
  );
  const [skillsEvidenceIds, setSkillsEvidenceIds] = useState<string[]>(() =>
    allIds(profile.evidences.map((entry) => entry.id)),
  );
  const [experienceEvidenceIds, setExperienceEvidenceIds] = useState<string[]>(() =>
    allIds(
      profile.evidences
        .filter((entry) => entry.experienceId !== null)
        .map((entry) => entry.id),
    ),
  );
  const [customItems, setCustomItems] = useState<string[]>(['']);

  useEffect(() => {
    onChange({
      experienceIds,
      educationEntryIds,
      summaryEvidenceIds,
      skillsEvidenceIds,
      experienceEvidenceIds,
      customItems,
    });
  }, [
    experienceIds,
    educationEntryIds,
    summaryEvidenceIds,
    skillsEvidenceIds,
    experienceEvidenceIds,
    customItems,
    onChange,
  ]);

  function updateCustomItem(index: number, value: string): void {
    setCustomItems((items) => items.map((item, position) => (position === index ? value : item)));
  }

  function removeCustomItem(index: number): void {
    setCustomItems((items) => items.filter((_, position) => position !== index));
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <h2 className="text-sm font-semibold text-text">O que entra em cada Section</h2>
      <p className="text-sm text-text-2">
        Tudo vem marcado por padrão. O que ficar desmarcado não entra no currículo.
      </p>
      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
        {showExperience && (
          <ItemChecklist
            legend="Experiências na Section Experience"
            items={profile.experiences.map((entry) => ({
              id: entry.id,
              label: `${entry.role} na ${entry.company} (${describePeriod(entry.startedOn, entry.endedOn)})`,
            }))}
            selected={experienceIds}
            onToggle={(id) => setExperienceIds((selected) => toggleId(selected, id))}
            onToggleAll={(next) =>
              setExperienceIds(() =>
                next ? profile.experiences.map((entry) => entry.id) : [],
              )
            }
          />
        )}
        {showExperience &&
          profile.experiences
            .filter((experience) => experienceIds.includes(experience.id))
            .map((experience) => {
              const linked = profile.evidences.filter(
                (evidence) => evidence.experienceId === experience.id,
              );
              if (linked.length === 0) return null;
              return (
                <ItemChecklist
                  key={experience.id}
                  legend={`Evidences de ${experience.role} na ${experience.company}`}
                  items={linked.map((entry) => ({ id: entry.id, label: entry.statement }))}
                  selected={experienceEvidenceIds}
                  onToggle={(id) =>
                    setExperienceEvidenceIds((selected) => toggleId(selected, id))
                  }
                  onToggleAll={(next) =>
                    setExperienceEvidenceIds((selected) => {
                      const linkedIds = linked.map((entry) => entry.id);
                      if (next) {
                        const merged = new Set([...selected, ...linkedIds]);
                        return [...merged];
                      }
                      return selected.filter((id) => !linkedIds.includes(id));
                    })
                  }
                />
              );
            })}
        {showEducation && (
          <ItemChecklist
            legend="Formação na Section Education"
            items={profile.educationEntries.map((entry) => ({
              id: entry.id,
              label: `${entry.degree} na ${entry.institution} (${describePeriod(entry.startedOn, entry.endedOn)})`,
            }))}
            selected={educationEntryIds}
            onToggle={(id) => setEducationEntryIds((selected) => toggleId(selected, id))}
            onToggleAll={(next) =>
              setEducationEntryIds(() =>
                next ? profile.educationEntries.map((entry) => entry.id) : [],
              )
            }
          />
        )}
        {showSummary && (
          <ItemChecklist
            legend="Evidences que alimentam o Summary"
            items={profile.evidences.map((entry) => ({ id: entry.id, label: entry.statement }))}
            selected={summaryEvidenceIds}
            onToggle={(id) => setSummaryEvidenceIds((selected) => toggleId(selected, id))}
            onToggleAll={(next) =>
              setSummaryEvidenceIds(() =>
                next ? profile.evidences.map((entry) => entry.id) : [],
              )
            }
          />
        )}
        {showSkills && (
          <ItemChecklist
            legend="Evidences que alimentam o Skills"
            items={profile.evidences.map((entry) => ({ id: entry.id, label: entry.statement }))}
            selected={skillsEvidenceIds}
            onToggle={(id) => setSkillsEvidenceIds((selected) => toggleId(selected, id))}
            onToggleAll={(next) =>
              setSkillsEvidenceIds(() =>
                next ? profile.evidences.map((entry) => entry.id) : [],
              )
            }
          />
        )}
      </div>
      {showCustom && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-[13px] font-semibold text-text">Itens da Custom Section</legend>
          <p className="text-sm text-text-2">
            Escreva à mão cada item da seção livre. Sem itens, a seção livre não é criada.
          </p>
          {customItems.map((item, index) => (
            <div key={index} className="flex items-end gap-2">
              <div className="flex-1">
                <LabeledInput
                  id={`custom-section-item-${String(index)}`}
                  label={`Item ${String(index + 1)}`}
                  value={item}
                  onChange={(value) => updateCustomItem(index, value)}
                />
              </div>
              {customItems.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCustomItem(index)}
                  aria-label={`Remover item ${String(index + 1)}`}
                  className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm font-semibold text-text shadow hover:border-border-hover hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  Remover
                </button>
              )}
            </div>
          ))}
          <div>
            <Button type="button" onClick={() => setCustomItems((items) => [...items, ''])}>
              Adicionar item
            </Button>
          </div>
        </fieldset>
      )}
    </Card>
  );
}
