import { Button } from '../../../../components/button';
import { ErrorMessage } from '../../../../components/error-message';

interface ConfirmPanelProps {
  readonly isConfirming: boolean;
  readonly confirmationError: string | null;
  readonly onGoBack: () => void;
  readonly onConfirm: () => void;
}

const WHAT_HAPPENS: readonly string[] = [
  'O que está conferido aqui vira seu Career Profile — o acervo de onde todo currículo seu será montado.',
  'Esse conteúdo passa a valer para todos os currículos que você criar daqui para frente.',
  'O arquivo que você enviou é apagado logo depois da confirmação; o que fica é o que está revisado aqui.',
];

export function ConfirmPanel({
  isConfirming,
  confirmationError,
  onGoBack,
  onConfirm,
}: ConfirmPanelProps): React.JSX.Element {
  return (
    <section
      aria-label="Confirmação final"
      className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow"
    >
      <h2 className="text-base font-semibold text-text">Confirmação final</h2>
      <p className="font-medium text-text">
        Ao apertar o botão abaixo, acontece o seguinte:
      </p>
      <ul className="list-disc space-y-2 pl-6 text-text">
        {WHAT_HAPPENS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {confirmationError !== null && <ErrorMessage message={confirmationError} />}
      <div className="flex flex-wrap gap-3">
        <Button onClick={onGoBack} disabled={isConfirming}>
          Voltar e conferir mais um pouco
        </Button>
        <Button onClick={onConfirm} disabled={isConfirming}>
          {isConfirming ? 'Confirmando…' : 'Confirmar e criar meu Career Profile'}
        </Button>
      </div>
    </section>
  );
}
