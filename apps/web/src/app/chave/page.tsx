'use client';

import { useRouter } from 'next/navigation';
import { DeepSeekKeyForm } from '../../components/deepseek-key-form';
import { Card, CardHeader } from '../../components/ui/card';

export default function ChavePage(): React.JSX.Element {
  const router = useRouter();

  function handleSaved(isAvailable: boolean): void {
    if (isAvailable) {
      router.replace('/');
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text">
          Informe sua chave da DeepSeek
        </h1>
        <p className="text-text-2">
          O cv-adapter roda na sua máquina e usa a sua conta na DeepSeek para ler vagas e
          currículos.
        </p>
      </header>
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold tracking-[-0.01em] text-text">
            Chave da DeepSeek
          </h2>
        </CardHeader>
        <div className="p-4">
          <DeepSeekKeyForm onSaved={handleSaved} />
        </div>
      </Card>
    </main>
  );
}
