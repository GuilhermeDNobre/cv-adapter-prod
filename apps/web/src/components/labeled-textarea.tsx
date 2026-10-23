interface LabeledTextAreaProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly describedBy: string;
  readonly placeholder: string;
}

const TEXTAREA_CLASSES = [
  'rounded-[10px] border border-border-strong bg-surface px-[14px] py-3 font-mono text-sm leading-[1.6] text-text resize-y',
  'hover:border-border-hover',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
].join(' ');

export function LabeledTextArea({
  id,
  label,
  value,
  onChange,
  describedBy,
  placeholder,
}: LabeledTextAreaProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-text-2">
        {label}
      </label>
      <textarea
        id={id}
        rows={12}
        value={value}
        placeholder={placeholder}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
        className={TEXTAREA_CLASSES}
      />
    </div>
  );
}
