# Três níveis: fato compartilhado no Career Profile, redação local em cada currículo

O produto reescreve *a mesma experiência* de formas diferentes conforme a vaga — em STAR para um
banco, em XYZ para uma startup. Isso só é possível se o fato e a redação forem coisas distintas.
Além disso, as perguntas que a IA faz sobre métricas só compensam se a resposta valer para sempre,
e não apenas para a vaga daquele dia.

Decidimos: **três níveis.** O **Career Profile** guarda **Evidences**, que são fatos sem layout e
sem limite de tamanho. Um **Base Resume** é uma seleção curada dessas **Evidences** com **Template**
e ordem. Um **Tailored Resume** é esse **Base Resume** adaptado a uma **Job Description**.

E a regra que os liga: **a Evidence é compartilhada por referência, o Bullet é local.** Corrigir o
período de um emprego conserta todos os currículos de uma vez; reescrever um **Bullet** em XYZ não
vaza para nenhum outro.

## Consequências

- Um erro na importação contamina todos os currículos, porque a **Evidence** é compartilhada. Por
  isso a extração passa por revisão obrigatória antes de virar **Career Profile**.
- A herança é sempre no mesmo sentido: **Base Resume** define e **Tailored Resume** herda, para
  **Comment**, **Writing Method** e **Tone**. Nada volta do **Tailored Resume** para o **Base
  Resume**.
- Existem duas superfícies de edição para construir, a do **Career Profile** e a do currículo, e
  **a do Career Profile não pode parecer um currículo**. Ela mostra fatos em campos separados, não
  um documento, justamente para que ninguém confunda corrigir um fato — que propaga — com reescrever
  um **Bullet** — que não sai dali. Cada **Evidence** exibe em quantos currículos é usada, o que
  exige poder consultar as referências, e a correção também fica acessível inline a partir do
  **Bullet** que a originou.
- Confirmar uma **Suggestion** cria **Evidence**, então o acervo cresce com o uso e a mesma pergunta
  nunca é feita duas vezes.

## Fato propaga, estrutura congela

A **Evidence** ser compartilhada resolvia o que acontece quando um *fato* muda, mas não o que
acontece quando a *estrutura* do **Base Resume** muda depois de já ter derivado um **Tailored
Resume**.

Decidimos que a estrutura não propaga: ao ser criado, um **Tailored Resume** fixa quais
**Sections** tem e em que ordem. Adicionar um emprego ao **Base Resume** entra nos próximos
**Tailored Resumes**, nunca nos antigos. Isso segue de o **Tailored Resume** ser o retrato de uma
candidatura (ADR 0006): mudar sozinho depois faria o documento deixar de representar o que foi
enviado.

Correção de **Evidence** continua alcançando todos os currículos, inclusive antigos, marcando os
**Bullets** afetados (ADR 0009). O PDF já exportado não muda: ele está guardado imutável (ADR
0008), então quem ganha o buraco é o documento editável, não o registro do que a empresa recebeu.

Para isso não virar rigidez, **estrutura é editável nos dois níveis**: adicionar, remover e
reordenar **Sections** vale tanto no **Base Resume** quanto no **Tailored Resume**. Adicionar uma
**Section** de experiência é escolher **Evidences** do **Career Profile** e deixar a IA redigir os
**Bullets** no **Writing Method** e **Tone** do documento — o produto nunca entrega campo em branco.
Remover tira do documento e não toca no **Career Profile**.

## Alternativas rejeitadas

- **Referência viva, texto incluso** — adaptar para uma vaga reescreveria o texto compartilhado e
  estragaria os outros currículos; STAR numa vaga e XYZ noutra seria impossível no mesmo campo.
- **Cópia integral no momento da criação** — isola bem, mas corrigir um cargo errado obriga a
  refazer em todos, e o **Career Profile** viraria um seed morto sem para onde as respostas do Q&A
  voltarem.
- **Dois níveis, com um currículo mestre longo fazendo as vezes de acervo** — mais simples, mas
  mistura o acervo ilimitado com um documento que precisa de ordem e **Template**.
