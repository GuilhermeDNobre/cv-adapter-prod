# Uma família de Templates, ATS-safe por construção, sem foto nem dados pessoais

O produto promete aumentar a chance de passar por ATS, e "passar por ATS" tem duas metades. A
segunda, o quanto o conteúdo bate com a vaga, é trabalho da IA. A primeira, o ATS conseguir extrair
os campos do arquivo, é **propriedade do Template** e não precisa ser medida por currículo: ou o
layout é parseável, ou não é.

Decidimos: **uma única família de Templates, com o mesmo conjunto de restrições de layout para
qualquer mercado.** Coluna única, sem tabela, sem caixa de texto, sem conteúdo em header ou footer,
fonte embutida, títulos de **Section** canônicos. O que muda com o idioma da **Job Description** é
o conteúdo — rótulos e quais **Sections** existem — nunca a estrutura.

Investigando a diferença entre currículo brasileiro e resume americano, ela quase não é de layout:
os dois querem coluna única e títulos claros. A diferença real é de conteúdo, e é aí que ela deve
viver.

## Sem foto e sem dados pessoais

**Foto, idade, estado civil e documentos não entram, nem em português.** Uma imagem é ruído para o
parser justamente no produto que promete parseabilidade, e esses campos são entrada direta para
discriminação. O custo aceito é que parte dos recrutadores brasileiros ainda espera foto.

## Dois Templates no v1, diferindo em densidade

A restrição ATS-safe estreita muito o espaço de designs possíveis: cinco **Templates** sob ela
seriam cinco documentos quase idênticos com fontes diferentes. Por isso o v1 tem **dois**, e eles
diferem em **densidade**, não em estilo: um confortável e um denso, para quem tem muita carreira e
não quer cortar conteúdo.

O segundo ganha o lugar por resolver um problema que já existe — quando o documento estoura a
página, trocar para o compacto passa a ser alternativa a cortar. A escolha tem critério, e não é
questão de gosto.

## Consequências

- As regras de ATS viram asserções sobre CSS, testáveis automaticamente, e não recomendações num
  documento que ninguém lê.
- Quem procura um currículo visualmente elaborado não é o público deste produto.
- Uma **Section** nova precisa nascer com rótulo nos dois idiomas.

## Alternativas rejeitadas

- **Duas famílias, BR e US** — dobra o trabalho de desenho e de paginação, reintroduz foto, e não
  responde o caso mais comum de todos: vaga em inglês numa empresa brasileira.
- **Convenções brasileiras sempre** — coerente com "Brasil primeiro", mas entrega um resume em
  inglês com forma brasileira justamente para quem aplica a vaga internacional, que é o público que
  paga mais.
