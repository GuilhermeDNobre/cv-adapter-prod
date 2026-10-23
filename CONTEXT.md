# cv-adapter

Adapta o currículo de uma pessoa a uma vaga específica usando IA, maximizando a chance de
aprovação em triagem por ATS. Este arquivo é o glossário do domínio: define **o que cada termo
significa**, nunca como é implementado.

Termos canônicos em inglês (viram identificadores no código); definições em português.

## Language

### Conteúdo da pessoa

**Source Document**:
O arquivo que a pessoa envia (PDF, LaTeX ou HTML) para servir de insumo de importação.
_Avoid_: currículo original, upload, arquivo do usuário

**Career Profile**:
O acervo ilimitado e sem layout de tudo que a pessoa já fez — experiências, formação, métricas e
respostas às perguntas da IA.
_Avoid_: perfil, mestre, master CV, banco de experiências

**Evidence**:
Um fato verificável sobre a carreira da pessoa (uma conquista com sua métrica, uma
responsabilidade), guardado no **Career Profile** e independente de qualquer redação.
_Avoid_: conquista, item, fato, achievement

**Bullet**:
A redação de uma **Evidence** dentro de uma **Section** — o texto que aparece naquele currículo
específico e só nele.
_Avoid_: linha, item, frase, marcador

### Documentos

**Base Resume**:
Uma seleção curada do **Career Profile**, com **Template** e ordem definidos, que serve de ponto
de partida para candidaturas.
_Avoid_: currículo base, mestre, original

**Tailored Resume**:
O **Base Resume** adaptado a uma **Job Description** específica, e a representação de uma
candidatura: a vaga fica fixada na criação e nunca muda.
_Avoid_: currículo adaptado, versão, cópia, candidatura, application

**Section**:
Uma parte nomeada e ordenável de um currículo, e a menor unidade que a pessoa pode comentar e
mandar reescrever. Existe em cinco formas: **Summary**, **Experience**, **Education**, **Skills**
e **Custom Section**.
_Avoid_: bloco, parte, trecho

**Custom Section**:
A **Section** de forma livre (título mais itens) que acomoda tudo fora do núcleo tipado —
publicações, prêmios, idiomas, voluntariado, patentes.
_Avoid_: seção extra, outros, miscelânea

**Template**:
O modelo visual curado por nós que define como um currículo é renderizado em página e PDF.
_Avoid_: modelo, tema, layout, design

### Trabalho da IA

**Suggestion**:
Conteúdo que a IA redige sem lastro numa **Evidence** — a pergunta sobre um **Gap** e, junto
dela, uma frase completa extrapolada de experiência adjacente — e que não é renderizado no PDF
enquanto a pessoa não o editar ou aprovar.
_Avoid_: sugestão, rascunho, proposta, placeholder

**Comment**:
Uma instrução de reescrita que a pessoa deixa numa **Section** e que continua valendo em toda
regeração daquela **Section** até ser resolvida.
_Avoid_: comentário, anotação, feedback, prompt

**Writing Method**:
A estrutura narrativa aplicada aos **Bullets** de uma **Section** do tipo **Experience** — STAR,
XYZ, CAR ou APR.
_Avoid_: método, formato, framework, padrão

**Tone**:
O registro de linguagem do currículo (por exemplo formal, direto, técnico).
_Avoid_: tipo de linguagem, estilo, voz

**Length Target**:
Em quantas páginas o currículo deve caber, que somado à densidade do **Template** vira o orçamento
do **Adaptation Plan**.
_Avoid_: tamanho, limite, páginas

**Evaluation**:
O diagnóstico de um **Career Profile** contra uma **Job Description** — **Match Score**, cobertura
de **Requirements** e **Gaps** — produzido sem escrever texto nenhum.
_Avoid_: análise, diagnóstico, avaliação, preview

**Adaptation Plan**:
A decisão de quais **Evidences** entram em quais **Sections** de um **Tailored Resume** e quais
**Requirements** cada uma cobre, produzida antes de qualquer texto ser escrito.
_Avoid_: plano, estratégia, outline, seleção

**Gap**:
A distância entre o que a **Job Description** pede e o que o **Career Profile** comprova; é de
*existência* quando a experiência pode nem existir, e de *detalhe* quando a **Evidence** existe mas
falta a métrica. Fica *negado* quando a pessoa responde que não tem aquilo.
_Avoid_: lacuna, falta, buraco, missing

**Interview**:
A sequência de perguntas guiada por uma **Job Description** que converte respostas em
**Evidences**, usada por quem monta o **Career Profile** sem um **Source Document**. **Cortada em
2026-09-23** (ADR 0014 supersedido): o termo fica só para ler os documentos antigos.
_Avoid_: entrevista, questionário, onboarding, chat

### Vaga

**Job Description**:
O texto da vaga contra a qual um **Base Resume** é adaptado.
_Avoid_: vaga, JD, anúncio

**Requirement**:
Uma exigência isolada extraída de uma **Job Description**, guardada com o termo literal usado pela
vaga e classificada como obrigatória ou desejável conforme a própria vaga a apresenta.
_Avoid_: requisito, skill, critério, keyword

**Match Score**:
A proporção ponderada de **Requirements** cobertos por alguma **Evidence**, com obrigatório
pesando mais que desejável.
_Avoid_: score, compatibilidade, aderência, nota

## Relationships

- Um **Career Profile** nasce de importar um **Source Document** (a **Interview** foi cortada)
- Um **Source Document** é importado e alimenta o **Career Profile**
- Um **Career Profile** pertence a exatamente uma pessoa e origina um ou mais **Base Resumes**
- Um **Base Resume** usa exatamente um **Template** e contém uma ou mais **Sections** ordenadas
- Todo **Template** é de coluna única e parseável por ATS, e nenhum exibe foto, idade, estado civil
  ou documento
- Só a **Section** do tipo **Experience** recebe método de redação (STAR, XYZ, CAR, APR), porque só
  ela descreve conquista de trabalho
- Um **Base Resume** mais uma **Job Description** produzem um **Tailored Resume**; outra vaga é
  outro **Tailored Resume**
- Um **Tailored Resume** é escrito no idioma da sua **Job Description**, independente do idioma em
  que as **Evidences** foram registradas
- Um **Career Profile** contém muitas **Evidences**
- Um **Bullet** redige exatamente uma **Evidence**; uma **Evidence** tem tantos **Bullets** quantos
  forem os currículos que a usam
- Corrigir uma **Evidence** propaga para todos os currículos; reescrever um **Bullet** não sai dali
- **Base Resume** define, **Tailored Resume** herda e pode sobrescrever: vale para **Comment**,
  **Writing Method**, **Tone**, **Template** e **Length Target**, e nada volta do **Tailored
  Resume** para o **Base Resume**
- Fato propaga, estrutura congela: corrigir uma **Evidence** alcança todo currículo, mas mudar as
  **Sections** de um **Base Resume** só vale para os **Tailored Resumes** criados depois
- Um **Comment** no **Base Resume** vale para todo **Tailored Resume** derivado dele; um **Comment**
  no **Tailored Resume** vale só naquela candidatura e nunca sobe
- Uma **Job Description** contém muitos **Requirements**; um **Requirement** sem **Evidence** que o
  cubra é um **Gap**, e a mesma análise alimenta o **Match Score** e as **Suggestions**
- Uma edição altera exatamente uma **Section**: nenhuma reescrita mexe numa **Section** vizinha,
  nem para o documento caber na página
- Uma **Evaluation** e um **Adaptation Plan** saem da mesma análise: a **Evaluation** é a face
  visível dela, o **Adaptation Plan** é a alocação interna
- Uma **Evaluation** pesa **Career Profile** contra **Job Description** e não depende de nenhum
  **Base Resume**: ela responde se a pessoa serve para a vaga, não se um documento serve
- Um **Adaptation Plan** decide *quais fatos*; a redação dos **Bullets** decide *que palavras*
- Um **Gap** produz uma **Suggestion**; confirmar uma **Suggestion** cria uma **Evidence**
- Um **Gap** negado continua pesando contra o **Match Score**, mas nunca volta a ser perguntado
- Uma **Suggestion** pode extrapolar de experiência adjacente, mas só chega ao PDF depois que a
  pessoa a edita ou aprova
- As respostas às perguntas da IA viram **Evidences** no **Career Profile**, não texto num
  currículo isolado

## Example dialogue

> **Dev:** Quando a pessoa edita o texto de um **Bullet** num **Tailored Resume**, isso conserta a
> **Evidence**?
>
> **Especialista:** Não. **Evidence** é o fato, **Bullet** é como aquele fato foi escrito naquele
> currículo. Se ela mudar "liderei" para "coordenei", isso é redação e fica ali. Agora, se ela
> corrigir que saiu da empresa em 2023 e não em 2022, isso é fato, muda a **Evidence** e aparece em
> todos os currículos.
>
> **Dev:** E se o texto que ela editar disser algo que a **Evidence** não comprova?
>
> **Especialista:** Aí depende de quem escreveu. Se foi ela, o problema é dela. Se foi a IA, aquilo
> nasce como **Suggestion**, marcada como não confirmada, e não entra no PDF até ela editar ou
> aprovar. Depois disso a afirmação é dela também.
>
> **Dev:** A vaga pede Kubernetes e o **Career Profile** não tem. Isso derruba o **Match Score**?
>
> **Especialista:** Derruba se Kubernetes for um **Requirement** obrigatório. E o mesmo **Gap** que
> puxa o score para baixo vira a **Suggestion** que pergunta se ela tem essa experiência. Se
> responder que sim, isso vira **Evidence** e vale para toda vaga seguinte — a pergunta não se
> repete.

## Flagged ambiguities

- "currículo" foi usado para o arquivo enviado e para a estrutura interna — resolvido: são coisas
  distintas. O **Source Document** é insumo de importação e nunca volta a ser editado.
- "Resume" sozinho é ambíguo, porque **Base Resume** e **Tailored Resume** são os dois currículos.
  Use sempre o termo completo; "Resume" isolado só como guarda-chuva em prosa.
- "modelo" foi usado para o **Template** visual e para o arquivo que a pessoa envia — resolvido:
  **Template** é sempre curado por nós. Enviar um arquivo importa conteúdo, nunca layout.
- "experiência" foi usado para o fato e para o texto que aparece no currículo — resolvido:
  **Evidence** é o fato, **Bullet** é a redação. A IA reescrever a mesma **Evidence** em STAR numa
  vaga e em XYZ noutra é a razão de os dois serem separados.
- "perguntas geradas pela IA" parecia uma feature à parte — resolvido: é parte da **Suggestion**,
  que diante de um **Gap** traz a pergunta e o rascunho juntos (ADR 0018).
- **Credit**, **Subscription** e **Daily Quota** saíram do glossário com o ADR 0017: a ferramenta
  roda na máquina de quem usa, sem cobrança nem limite de uso. Se aparecerem num documento antigo,
  descrevem o produto hospedado que deixou de existir.
- "candidatura" não vira entidade própria: um **Tailored Resume** já é exatamente isso, porque
  nasce preso a uma **Job Description** imutável.
- "Evaluation" chegou definida contra um **Base Resume**, o que contradizia o **Match Score** ser
  calculado sobre **Evidences** — resolvido: a **Evaluation** é sempre contra o **Career Profile**.
