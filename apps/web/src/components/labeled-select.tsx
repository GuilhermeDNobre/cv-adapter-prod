interface LabeledSelectProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>;
  readonly onCommit: (value: string) => void;
}

const SELECT_CLASSES = [
  'h-9 rounded-lg border border-border-strong bg-surface px-3 text-text',
  'hover:border-border-hover',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
].join(' ');

export function LabeledSelect({
  id,
  label,
  value,
  options,
  onCommit,
}: LabeledSelectProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-text-2">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onCommit(event.target.value)}
        className={SELECT_CLASSES}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
