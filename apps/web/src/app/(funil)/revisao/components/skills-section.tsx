import { useState } from 'react';
import type { DragEvent } from 'react';
import { Popover } from 'radix-ui';
import type { SkillDraft } from 'schema/contracts/resume-import';
import { LabeledInput } from '../../../../components/labeled-input';
import { Button } from '../../../../components/button';

interface SkillsSectionProps {
  readonly skills: readonly SkillDraft[];
  readonly onAddSkill: (skill: SkillDraft) => void;
  readonly onRemoveSkill: (index: number) => void;
  readonly onMoveSkill: (index: number, group: string | null) => void;
}

function groupSkills(skills: readonly SkillDraft[]): Array<{
  readonly group: string | null;
  readonly items: Array<{ readonly skill: SkillDraft; readonly index: number }>;
}> {
  const byGroup = new Map<string | null, Array<{ readonly skill: SkillDraft; readonly index: number }>>();
  skills.forEach((skill, index) => {
    const key = skill.group ?? null;
    const existing = byGroup.get(key) ?? [];
    existing.push({ skill, index });
    byGroup.set(key, existing);
  });
  const grouped: Array<{
    readonly group: string | null;
    readonly items: Array<{ readonly skill: SkillDraft; readonly index: number }>;
  }> = [];
  for (const [group, items] of byGroup) {
    if (group !== null) {
      grouped.push({ group, items });
    }
  }
  const ungrouped = byGroup.get(null);
  if (ungrouped !== undefined) {
    grouped.push({ group: null, items: ungrouped });
  }
  return grouped;
}

const UNGROUPED_HEADING = 'Habilidades';
const UNGROUPED_OPTION = 'Sem grupo';
const DRAG_MIME = 'text/plain';
const GROUP_FIELD_ID = 'skills-group';

function groupLabel(group: string | null): string {
  return group ?? UNGROUPED_HEADING;
}

function moveTargetLabel(group: string | null): string {
  return group ?? UNGROUPED_OPTION;
}

function groupTestId(group: string | null): string {
  return `skill-group-${group ?? 'ungrouped'}`;
}

function parseDragIndex(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function resolveGroupChoice(
  chosen: string | null | undefined,
  available: readonly string[],
): string | null {
  if (chosen !== undefined && (chosen === null || available.includes(chosen))) return chosen;
  return available[0] ?? null;
}

interface SkillMoveMenuProps {
  readonly skillName: string;
  readonly currentGroup: string | null;
  readonly targets: ReadonlyArray<string | null>;
  readonly onPick: (group: string | null) => void;
}

function SkillMoveMenu({ skillName, currentGroup, targets, onPick }: SkillMoveMenuProps): React.JSX.Element {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Mover ${skillName} para outro grupo`}
          className="flex h-6 w-6 items-center justify-center rounded text-text-2 hover:bg-surface-3 hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        >
          <span aria-hidden="true" className="text-sm leading-none">⋯</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={4}
          aria-label={`Mover ${skillName} para`}
          className="z-50 flex w-44 flex-col gap-1 rounded-xl border border-border bg-surface p-1.5 shadow-lg [transform-origin:var(--radix-popover-content-transform-origin)] data-[state=open]:animate-popover-in data-[state=closed]:animate-popover-out motion-reduce:data-[state=open]:animate-popover-fade-in motion-reduce:data-[state=closed]:animate-popover-fade-out"
        >
          {targets.map((target, targetIndex) => (
            <button
              key={`${String(targetIndex)}-${target ?? 'none'}`}
              type="button"
              disabled={target === currentGroup}
              onClick={() => onPick(target)}
              className="flex h-8 items-center rounded-lg px-3 text-left text-[13px] text-text hover:bg-surface-2 disabled:cursor-default disabled:text-text-3 disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            >
              {moveTargetLabel(target)}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

interface SkillChipProps {
  readonly skill: SkillDraft;
  readonly index: number;
  readonly targets: ReadonlyArray<string | null>;
  readonly onRemoveSkill: (index: number) => void;
  readonly onMoveSkill: (index: number, group: string | null) => void;
}

function SkillChip({ skill, index, targets, onRemoveSkill, onMoveSkill }: SkillChipProps): React.JSX.Element {
  function handleDragStart(event: DragEvent<HTMLLIElement>): void {
    event.dataTransfer.setData(DRAG_MIME, String(index));
  }
  function handlePick(target: string | null): void {
    onMoveSkill(index, target);
  }
  function handleRemove(): void {
    onRemoveSkill(index);
  }
  return (
    <li
      draggable
      onDragStart={handleDragStart}
      className="inline-flex h-[26px] items-center gap-1 rounded-md border border-border bg-surface-2 px-2 text-xs font-medium text-text"
    >
      <span>{skill.name}</span>
      <SkillMoveMenu
        skillName={skill.name}
        currentGroup={skill.group ?? null}
        targets={targets}
        onPick={handlePick}
      />
      <button
        type="button"
        aria-label={`Remover ${skill.name}`}
        onClick={handleRemove}
        className="flex h-6 w-6 items-center justify-center rounded text-text-2 hover:bg-surface-3 hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      >
        <span aria-hidden="true" className="text-sm leading-none">×</span>
      </button>
    </li>
  );
}

interface SkillsGroupProps {
  readonly group: string | null;
  readonly items: ReadonlyArray<{ readonly skill: SkillDraft; readonly index: number }>;
  readonly targets: ReadonlyArray<string | null>;
  readonly dropActive: boolean;
  readonly onEnterGroup: (group: string | null) => void;
  readonly onLeaveGroup: () => void;
  readonly onDropGroup: (group: string | null, data: DataTransfer) => void;
  readonly onRemoveSkill: (index: number) => void;
  readonly onMoveSkill: (index: number, group: string | null) => void;
}

function SkillsGroup({
  group,
  items,
  targets,
  dropActive,
  onEnterGroup,
  onLeaveGroup,
  onDropGroup,
  onRemoveSkill,
  onMoveSkill,
}: SkillsGroupProps): React.JSX.Element {
  function handleDragOver(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    onEnterGroup(group);
  }
  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    onDropGroup(group, event.dataTransfer);
  }
  const containerClasses = dropActive
    ? 'flex flex-col gap-2 rounded-lg bg-accent-soft p-1 ring-2 ring-focus'
    : 'flex flex-col gap-2 rounded-lg p-1';
  return (
    <div
      data-testid={groupTestId(group)}
      onDragOver={handleDragOver}
      onDragLeave={onLeaveGroup}
      onDrop={handleDrop}
      className={containerClasses}
    >
      <h3 className="text-[13px] font-medium text-text-2">{groupLabel(group)}</h3>
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <SkillChip
            key={`skill-${String(item.index)}-${item.skill.name}`}
            skill={item.skill}
            index={item.index}
            targets={targets}
            onRemoveSkill={onRemoveSkill}
            onMoveSkill={onMoveSkill}
          />
        ))}
      </ul>
    </div>
  );
}

const SELECT_CLASSES = [
  'h-9 rounded-lg border border-border-strong bg-surface px-3 text-text',
  'hover:border-border-hover',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
].join(' ');

export function SkillsSection({ skills, onAddSkill, onRemoveSkill, onMoveSkill }: SkillsSectionProps): React.JSX.Element {
  const [newSkill, setNewSkill] = useState('');
  const [chosenGroup, setChosenGroup] = useState<string | null | undefined>(undefined);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const grouped = groupSkills(skills);
  const groupNames = grouped.flatMap((entry) => (entry.group === null ? [] : [entry.group]));
  const targets: ReadonlyArray<string | null> = [...groupNames, null];
  const effectiveGroup = resolveGroupChoice(chosenGroup, groupNames);
  function handleEnterGroup(group: string | null): void {
    setDropKey(group ?? UNGROUPED_OPTION);
  }
  function handleLeaveGroup(): void {
    setDropKey(null);
  }
  function handleDropGroup(target: string | null, data: DataTransfer): void {
    setDropKey(null);
    const dragged = parseDragIndex(data.getData(DRAG_MIME));
    if (dragged === null) return;
    const origin = skills[dragged];
    if (origin === undefined) return;
    if ((origin.group ?? null) === target) return;
    onMoveSkill(dragged, target);
  }
  function handleGroupChange(value: string): void {
    setChosenGroup(value === '' ? null : value);
  }
  function addCurrent(): void {
    const name = newSkill.trim();
    if (name === '') return;
    onAddSkill({ name, group: effectiveGroup });
    setNewSkill('');
  }
  return (
    <section aria-label="Habilidades" className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-text">Habilidades</h2>
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-[10px] bg-surface-2 px-1.5 text-xs tabular-nums text-text-2">
          {String(skills.length)}
        </span>
      </div>
      <p className="text-[13px] text-text-2">
        Palavras-chave curtas do seu currículo, como linguagens e ferramentas. Frases viram palavras aqui.
      </p>
      {grouped.map((entry) => (
        <SkillsGroup
          key={entry.group ?? 'ungrouped'}
          group={entry.group}
          items={entry.items}
          targets={targets}
          dropActive={dropKey === (entry.group ?? UNGROUPED_OPTION)}
          onEnterGroup={handleEnterGroup}
          onLeaveGroup={handleLeaveGroup}
          onDropGroup={handleDropGroup}
          onRemoveSkill={onRemoveSkill}
          onMoveSkill={onMoveSkill}
        />
      ))}
      {skills.length === 0 && (
        <p className="text-text-2">
          Nenhuma habilidade veio do arquivo. Acrescente as palavras-chave que querem ver no currículo.
        </p>
      )}
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          addCurrent();
        }}
      >
        <div className="min-w-0 flex-1">
          <LabeledInput
            id="skills-new"
            label="Nova habilidade"
            value={newSkill}
            placeholder="Ex.: Kubernetes — Enter adiciona"
            onChange={setNewSkill}
          />
        </div>
        <div className="flex w-32 shrink-0 flex-col gap-1.5">
          <label htmlFor={GROUP_FIELD_ID} className="text-[13px] font-medium text-text-2">
            Grupo
          </label>
          <select
            id={GROUP_FIELD_ID}
            value={effectiveGroup ?? ''}
            onChange={(event) => handleGroupChange(event.target.value)}
            className={SELECT_CLASSES}
          >
            {groupNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value="">{UNGROUPED_OPTION}</option>
          </select>
        </div>
        <Button
          variant="secondary"
          type="submit"
        >
          + Adicionar
        </Button>
      </form>
    </section>
  );
}
