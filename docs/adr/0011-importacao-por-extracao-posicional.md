# Importação por extração posicional, não por visão

Um **Source Document** em PDF não tem estrutura semântica, só glifos posicionados, e currículos em
duas colunas são comuns. A leitura ingênua produz linhas embaralhadas — "João Silva Habilidades
Desenvolvedor Python Acme 2021" — e um modelo que recebe isso adivinha quem trabalhou onde.

A saída óbvia seria mandar a página para um modelo com visão. Ela não está disponível: o modelo do
projeto é texto-only (ADR 0010), e a variante com visão é experimental e limitada demais para
página densa.

Decidimos: **o parser entrega texto com coordenadas, um passo determinístico agrupa por posição e
reconstrói a ordem de leitura, e o modelo faz só a estruturação semântica.** LaTeX e HTML entram
no mesmo extrator como texto-fonte, já em ordem.

O ponto que torna isso viável é que a ordem de leitura não é um problema de IA. É geometria, e
geometria é testável isoladamente, sem chamar modelo nenhum.

## Revisão obrigatória

A extração produz um **rascunho** que a pessoa confere antes de virar **Career Profile**. Isso não
é polimento de UX: como a **Evidence** é compartilhada (ADR 0005), um erro de extração contamina
todos os currículos que ela fizer, para sempre.

## Consequências

- PDF escaneado, sem camada de texto, deixa de ser suportado e precisa de recusa explícita com
  mensagem clara, não de uma extração silenciosamente vazia. Quem cair aí tem a **Interview**
  (ADR 0014) como saída, em vez de ficar sem caminho.
- Currículo com layout muito criativo ainda pode confundir o agrupamento por coluna. O passo tem
  que ser coberto por testes com PDFs reais de layouts variados.
- A tela de revisão da importação é trabalho de interface real e faz parte do caminho crítico de
  ativação.

## Alternativas rejeitadas

- **`deepseek-v4-flash-vision-exp`** — cobriria layout arbitrário e PDF escaneado, mas é
  experimental, tem duas semanas de vida e o limite indicado de 384 tokens por imagem é pouco para
  uma página densa. Apoiar o passo mais crítico do produto nisso é risco desproporcional.
- **Serviço dedicado de document AI só na extração** — melhor leitura possível, mas quebra a
  decisão de um único modelo, adiciona fornecedor, contrato e mais um subprocessador na LGPD, com
  custo por importação que é gratuita para a pessoa.
