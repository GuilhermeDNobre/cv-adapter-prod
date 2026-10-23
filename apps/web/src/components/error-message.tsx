interface ErrorMessageProps {
  readonly message: string;
}

const ERROR_MESSAGE_CLASSES = [
  'rounded-lg border border-danger bg-danger-soft p-3 text-danger-text',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger',
].join(' ');

export function ErrorMessage({ message }: ErrorMessageProps): React.JSX.Element {
  return (
    <div role="alert" className={ERROR_MESSAGE_CLASSES}>
      {message}
    </div>
  );
}
