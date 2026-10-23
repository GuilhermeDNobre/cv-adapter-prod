# Minimização de dado pessoal: o que sai da nossa infraestrutura e o que fica guardado

Um currículo é dado pessoal por definição, o produto é brasileiro e a arquitetura depende de mandar
conteúdo para um modelo de terceiro. A decisão fácil seria mandar o documento inteiro e guardar
tudo; ambas criam passivo sem contrapartida.

## O que vai para o provedor de IA

A IA trabalha sobre **Evidences** e **Requirements**, e não precisa de nome, telefone, e-mail,
endereço, links pessoais ou foto para escrever um **Bullet**. Esses campos são renderizados apenas
pelo **Template**.

Decidimos: **dados de contato nunca entram num prompt.** É minimização estrutural, não uma regra de
processo que alguém esquece — o dado simplesmente não está no objeto que a camada de IA recebe. O
provedor é a **API oficial da DeepSeek** (ver ADR 0010), que **não oferece contrato de retenção
zero**. Levantamento de setembro de 2026 indica retenção de entradas por volta de 30 dias, logs por
volta de 90, e ToS que permite treinar em dados enviados por padrão, com contas pagas de API fora
do treino desde a política de março de 2026 — o que é política revogável, não garantia contratual.
**Esses números vieram de fontes de terceiros e precisam ser conferidos contra os termos vigentes
antes do lançamento.**

Consequências que essa escolha impõe:

- a transferência internacional para a China precisa de base legal explícita sob a LGPD, declarada
  na política de privacidade, com consentimento informado no cadastro;
- a DeepSeek precisa aparecer nomeada como subprocessadora;
- **a minimização estrutural deixa de ser boa prática e passa a ser a principal mitigação que
  resta.** É ela que separa "vazou o histórico profissional de alguém" de "vazou o currículo
  identificado de uma pessoa, com nome e telefone".

Prompt e resposta nunca vão para log.

Isso não é anonimato: empresa mais período ainda identifica quem quiser cruzar dados. É redução de
superfície, e é o máximo possível sem destruir o sinal que faz a adaptação funcionar — saber que a
vaga é numa fintech e a pessoa veio de outra fintech é justamente o que se quer aproveitar.

## O que fica guardado no R2

Decidimos: **o Source Document é apagado assim que a pessoa confirma a revisão da importação**, e
**o PDF exportado é guardado como registro imutável da candidatura**. O bucket é privado e o acesso
acontece só por URL assinada de curta duração.

O PDF parece derivável, mas não é: quando o **Template** evoluir, re-renderizar produz um documento
diferente do que a empresa recebeu. Como um **Tailored Resume** representa uma candidatura, o PDF é
o registro do que foi enviado.

## Consequências

- O modelo de dados precisa separar contato do resto desde o início; enfiar contato dentro de uma
  **Section** quebraria a garantia.
- Se a extração estiver errada e a pessoa só perceber depois, não há como reprocessar: ela reenvia o
  arquivo.
- Excluir uma conta se resume a apagar as linhas e o prefixo daquela pessoa no R2.

## Exclusão de conta

Pedir exclusão **desativa a conta na hora e purga o conteúdo em 30 dias**, com o prazo informado
na interface e na política de privacidade. O caminho é único: não existe exclusão imediata.

A janela existe para recuperar exclusão acidental, e o custo aceito é que quem procura emprego
escondido e quer sumir agora precisa esperar. Isso torna o texto da interface parte da decisão, e
não um detalhe: o prazo aparece no momento de menor confiança da pessoa e precisa ser dito sem
rodeio.

O registro fiscal de pagamento é preservado pelo prazo legal em qualquer caso, desvinculado do
conteúdo de currículo. "Apagar tudo" não é uma opção disponível.
