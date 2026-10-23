# A IA pode propor conteúdo sem lastro, mas nunca inventa especificidade

> **EMENDADO em 2026-09-16 pelo ADR 0018.** A proibição de redigir a frase específica caiu: a
> Suggestion agora escreve rascunho completo, e a proteção passou a ser a edição da pessoa
> antes do PDF. O resto deste ADR — a pergunta diante da lacuna, a Evidence criada ao
> confirmar, a pergunta que nunca se repete — **continua valendo**.

A IA precisa lidar com a lacuna entre a **Job Description** e o **Career Profile**: a vaga pede
Kubernetes e a pessoa não tem Kubernetes registrado. Ignorar a lacuna produz um currículo pior que
o do concorrente; preencher a lacuna produz um currículo que derruba a pessoa na entrevista.

Decidimos: **a IA propõe conteúdo sem lastro como Suggestion, que não entra no PDF enquanto não
for confirmada, e uma Suggestion nunca introduz número, ferramenta, escala ou cargo que não esteja
numa Evidence.** A forma da Suggestion depende do tipo de lacuna:

- **Lacuna de existência** (a pessoa tem ou não tem essa experiência): vira pergunta, sem frase
  pronta. Não há redação possível que não seja invenção.
- **Lacuna de detalhe** (a Evidence existe, falta a métrica): vira frase com buraco explícito, que
  só pode ser confirmada depois de preenchido.

Confirmar uma Suggestion cria uma **Evidence** no **Career Profile**, então o fato passa a valer
para todos os currículos seguintes e a pergunta nunca é repetida.

## Consequências

- A geração de perguntas pela IA deixa de ser uma feature separada: é o comportamento da Suggestion
  diante de uma lacuna de existência.
- O match inicial contra a vaga é menor que o de um concorrente que inventa. Isso é deliberado.
- Existem dois comportamentos de Suggestion para construir e testar, não um.
- A responsabilidade pelo fato fica sempre com a pessoa: nunca escrevemos a afirmação específica
  que ela só precisaria confirmar.

## Alternativas rejeitadas

- **Frase completa e plausível, marcada como não confirmada** — mais simples de implementar e mais
  impressionante na primeira tela, mas um número plausível como "reduzi custo em 30%" parece
  revisado e ninguém confere. A mentira ficaria escrita por nós, a um clique do PDF.
- **Nunca propor nada, só perguntar** — fronteira trivial, porém joga toda a redação de volta para
  a pessoa e anula o ganho de ter a IA proativa sobre lacunas.
