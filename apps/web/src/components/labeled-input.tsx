interface LabeledInputProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onBlur?: () => void;
  readonly describedBy?: string;
  readonly placeholder?: string;
}

const INPUT_CLASSES = [
  'h-9 rounded-lg border border-border-strong bg-surface px-3 text-text',
  'hover:border-border-hover',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
].join(' ');

export function LabeledInput({
  id,
  label,
  value,
  onChange,
  onBlur,
  describedBy,
  placeholder,
}: LabeledInputProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-text-2">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => onBlur?.()}
        className={INPUT_CLASSES}
      />
    </div>
  );
}
