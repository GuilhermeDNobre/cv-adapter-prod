# A Suggestion passa a redigir rascunho completo, e a pessoa assina antes do PDF

Emenda ao ADR 0002, que proibia a IA de escrever a frase específica diante de uma lacuna sem
lastro. A regra cumpria o que prometia, mas deixava a pessoa diante da página em branco exatamente
onde ela mais precisava de ajuda: a vaga é de frontend, o histórico dela é de backend, e o produto
respondia com uma pergunta e nenhuma redação.

Decidimos: **a IA redige a frase inteira a partir de experiência adjacente, marcada como não
confirmada, e ela só entra no PDF depois que a pessoa edita ou aprova.**

- A **pergunta continua existindo** para lacuna de existência — ela é o que traz o fato novo. O que
  muda é que, junto da pergunta, vem um rascunho utilizável.
- O rascunho pode **extrapolar a partir do que existe** — inferir uma ferramenta vizinha, propor
  uma métrica plausível — e é aqui que esta emenda contraria o ADR 0002 de propósito.
- **Nada entra no PDF sem passar pela edição da pessoa.** É o que sobrou da proteção original, e é
  o que mantém a responsabilidade pelo fato com quem vai à entrevista.
- Confirmar continua criando **Evidence** no **Career Profile**, então o fato vale para os próximos
  currículos e a pergunta não se repete.

## Consequências

- O **Match Score** sobe mais rápido, e passa a refletir conteúdo que a pessoa aprovou, não só
  conteúdo com lastro documental. São coisas diferentes e o número deixa de distinguir as duas.
- **O risco na entrevista passa a ser real e é de quem usa.** O ADR 0002 evitava isso escrevendo
  menos; esta emenda troca essa proteção pela revisão humana antes do PDF. Numa ferramenta local,
  de uso próprio, é uma troca que quem roda tem o direito de fazer.
- A distinção entre lacuna de existência e lacuna de detalhe **deixa de mudar o formato da
  resposta** — as duas viram pergunta mais rascunho. Some um dos dois comportamentos de Suggestion
  que o ADR 0002 mandava construir.
- A interface precisa deixar **visível e óbvio** o que é rascunho não confirmado. Sem isso a pessoa
  aprova no automático e a emenda vira a alternativa que o ADR 0002 rejeitou.

## Alternativas rejeitadas

- **Manter o ADR 0002 como estava** — mais seguro, e foi a decisão original por bons motivos, mas
  mantinha a página em branco no ponto de maior atrito.
- **Otimizar para o Match Score sem freio** — a IA escreveria direto no PDF o que maximiza
  aderência. Tira a pessoa do circuito no exato momento em que ela é a única que sabe o que é
  verdade.
