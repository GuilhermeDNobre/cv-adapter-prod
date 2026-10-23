# O invariante de veracidade é verificado por máquina, no CI e em runtime

O ADR 0002 proíbe a IA de introduzir número, ferramenta, escala ou cargo ausente das **Evidences**.
Escrito só no prompt, isso é uma intenção que o modelo cumpre quase sempre — e "quase sempre" é
exatamente o modo de falha que o ADR existia para eliminar.

A sorte é que o invariante é **mecanicamente verificável**: basta extrair números e nomes próprios
de cada **Bullet** gerado e conferir se aparecem na **Evidence** de origem. Não precisa de
julgamento humano nem de um segundo modelo.

Decidimos verificar nos dois lugares.

## No CI

Um golden set de pares (**Career Profile**, **Job Description**) roda a cada mudança de prompt, com
asserções determinísticas que quebram o build:

- todo número e ferramenta de um **Bullet** existe na **Evidence** de origem;
- nenhuma **Evidence** aparece em duas **Sections**;
- todo **Requirement** obrigatório está coberto ou virou **Suggestion**;
- a saída está no idioma da **Job Description**;
- o JSON valida contra o schema e o tamanho cabe no orçamento.

Isso não mede se o texto ficou bom — estilo continua sendo revisão humana por amostragem. Mede se
o sistema continua obedecendo às suas próprias regras.

## Em runtime

A mesma checagem roda antes de o **Bullet** chegar ao documento. **Um trecho que viola o invariante
é convertido em Suggestion de lacuna de detalhe**: a especificidade sem lastro vira o buraco que a
pessoa preenche. Nenhum mecanismo novo — é o formato que o ADR 0002 já definiu, e a falha do modelo
vira uma pergunta útil em vez de uma mentira no PDF.

## Ao editar uma Evidence, e no export

Verificar só no instante da geração deixa um buraco: um **Bullet** já escrito nunca é reexaminado,
então corrigir a métrica de uma **Evidence** de 85% para 70% transforma silenciosamente um
**Bullet** honesto num que afirma o que a **Evidence** não comprova mais.

Por isso a mesma checagem roda em mais dois momentos: **ao salvar uma Evidence**, sobre os
**Bullets** que a redigem, e **na geração do PDF**, sobre o documento inteiro. Quem falhar vira
**Suggestion** de lacuna de detalhe e para de ser renderizado, como em qualquer outra violação.

O invariante passa a valer no tempo, e não apenas no instante em que o texto nasceu. Nada é
reescrito automaticamente, então redação que a pessoa ajustou à mão sobrevive.

## Consequências

- A taxa de violação precisa ser observada como métrica. Se subir, o prompt regrediu e isso tem que
  ser visível antes de o usuário perceber.
- Um falso positivo (o número existia na **Evidence** mas escrito de outra forma) degrada para
  pergunta, o que é o lado seguro de errar.
- Montar e manter o golden set é trabalho real e recorrente, não um item de setup.
- Corrigir um fato pode abrir um buraco num currículo que a pessoa nem estava editando, então o
  aviso precisa ser explícito: "você corrigiu um fato, dois currículos precisam de ajuste".

## Alternativas rejeitadas

- **LLM como juiz** — mede estilo, mas carrega os vieses do gerador, a nota flutua entre execuções e
  um número inventado pode "soar ótimo" e passar.
- **Regerar a Section até passar** — triplica custo e latência dentro de um job já pago, e um modelo
  que inventou tende a inventar de novo.
- **Verificar só no CI** — basta um caso fora do golden set para um número inventado chegar ao PDF.
