# Adaptação em duas etapas: o plano aloca, a redação escreve

A adaptação de um **Base Resume** a uma **Job Description** roda como um job-pai com um filho por
**Section** em paralelo, o que torna a adaptação perceptivelmente rápida mas cega os filhos uns aos
outros: duas **Sections** escolheriam a mesma **Evidence** e o currículo repetiria a mesma
conquista.

Decidimos: **o job-pai produz um Adaptation Plan e os filhos apenas redigem.** O pai roda uma
análise única que extrai os **Requirements**, casa cada um com as **Evidences** que o cobrem, marca
os **Gaps** e aloca cada **Evidence** a uma **Section**. Cada filho recebe a lista já decidida e
escreve os **Bullets** no **Writing Method** e **Tone** do documento.

Isso reaproveita a separação entre **Evidence** e **Bullet** que já existe: a etapa de plano decide
*quais fatos*, a de redação decide *que palavras*.

## O plano precisa de um orçamento

Escolher *quais fatos* sem saber *quantos cabem* não tem regra de parada. O **Adaptation Plan**
recebe um orçamento em caracteres, derivado de duas coisas: o **Length Target** do documento (uma
ou duas páginas) e a densidade do **Template** escolhido.

A conversão é estimativa e vai errar às vezes — quem mede de verdade é o render no cliente, e o
estouro é tratado como na regra de que nenhuma reescrita mexe numa **Section** vizinha. Mas sem o
orçamento o plano não teria onde parar.

Um efeito colateral útil: como o **Template** compacto entrega mais orçamento para o mesmo número
de páginas, **trocar de Template vira alternativa real a cortar conteúdo**, e a escolha deixa de
ser estética.

## Consequências

- Repetição entre **Sections** é impossível por construção, sem passo de deduplicação.
- Uma única análise alimenta quatro coisas: o **Match Score**, a lista de cobertura, as
  **Suggestions** e o plano de alocação.
- O plano é auditável: dá para mostrar por que um **Bullet** está naquela **Section**.
- O pai vira o passo crítico. Um erro de alocação sai torto no documento inteiro, então é ele que
  merece o modelo mais forte e o maior esforço de avaliação.

## Alternativas rejeitadas

- **Cada filho escolhe e deduplica no final** — gera para descartar, deixa buracos no documento
  quando remove, e separa o plano da análise de cobertura, duplicando a chamada de IA.
- **Lista compartilhada de Evidences já usadas** — introduz corrida real entre jobs paralelos e o
  resultado passa a depender da ordem de execução, o que impede reprodução e depuração.
