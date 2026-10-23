# cv-adapter

[English](README.en.md)

Adapta o seu currículo para uma vaga específica com IA, usando só o que já está nele. Roda no seu
computador com Docker, e você usa a sua própria chave da API da DeepSeek.

A interface é em português. O currículo gerado sai no idioma da vaga, português ou inglês.

## Para quem é

Para quem manda o mesmo currículo para muitas vagas: estudantes, estagiários e juniores procurando a
primeira ou a próxima oportunidade, ou qualquer pessoa que vive reescrevendo o currículo a cada
anúncio.

A maioria das empresas passa as candidaturas por um ATS antes de alguém ler. O ATS precisa
conseguir ler o seu arquivo, e quem recruta procura nele as palavras que a vaga usa. Um currículo
genérico vai mal nas duas coisas. Adaptar na mão para cada vaga toma uma noite inteira, e pedir para
um chatbot fazer isso costuma devolver um currículo com ferramentas e números que você nunca teve,
que não se sustentam na entrevista.

O cv-adapter faz essa adaptação sem inventar. Ele pode reordenar, mudar o foco e reescrever o que
você já fez, mas não pode acrescentar o que você não fez.

## Como funciona

1. **Importe o seu currículo.** Envie um PDF. Seu nome e seus dados de contato são separados antes
   de qualquer coisa ir para a IA, e o resto vira o seu perfil profissional: cada experiência com as
   evidências que a sustentam. Você revisa e corrige tudo antes de salvar.
2. **Cole o anúncio da vaga.** Ele é dividido em requisitos, obrigatórios e desejáveis.
3. **Veja a aderência.** Cada requisito aparece como coberto, parcial ou gap em relação ao seu
   perfil, com uma nota de 0 a 100.
4. **Receba o currículo adaptado.** Todas as suas experiências continuam, inclusive as menores. O
   que muda é o foco, a ordem e a escrita, pensando em uma única página A4.
5. **Revise.** Veja o que mudou, desfaça o que não quiser ou peça para a IA reescrever uma seção do
   jeito que você descrever.
6. **Exporte o PDF.** Uma coluna, sem foto, sem tabelas e com títulos de seção simples, para o ATS
   conseguir ler. A pré-visualização e o PDF saem do mesmo template.

Os currículos importados ficam salvos em **Meus currículos**. Na próxima vaga, você cola o anúncio,
escolhe um deles e pula a importação.

## O que ele não faz

A IA não acrescenta números, ferramentas, escala nem cargos que não estejam no seu currículo. Antes
de uma linha gerada entrar no documento, os números e nomes dela são conferidos com a evidência de
onde ela veio. Uma linha que não passa na conferência vira sugestão, e sugestão só entra no PDF
depois que você edita ou aprova.

## Privacidade

- Tudo fica num Postgres local, num volume do Docker na sua máquina.
- A única coisa que sai do seu computador é o que vai para a API da DeepSeek: o seu currículo sem
  nome e dados de contato, mais o anúncio da vaga.
- A sua chave da DeepSeek é digitada no app e guardada nesse mesmo banco local. Ela nunca vai para
  um arquivo nem para uma variável de ambiente.
- Não há login. Uma instalação é de uma pessoa só, e todas as portas ficam presas a `127.0.0.1`.
  Não exponha o app na rede.
- Em **Configurações** você apaga os currículos gerados ou todos os seus dados.

## Como rodar

Você precisa de:

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) no Windows ou no macOS, ou
  Docker Engine com o plugin Compose no Linux.
- Uma chave da API da DeepSeek com algum crédito, criada em
  [platform.deepseek.com](https://platform.deepseek.com). O custo de IA é o que a DeepSeek cobrar
  nessa chave. O cv-adapter não cobra nada.
- As portas 3000, 3001, 5432 e 6379 livres em `127.0.0.1`. Um Postgres ou Redis que já rode na sua
  máquina vai entrar em conflito com os containers.

Depois:

```bash
git clone https://github.com/GuilhermeDNobre/cv-adapter-prod.git
cd cv-adapter-prod
docker compose up --build
```

O primeiro build leva alguns minutos, porque a imagem da `api` inclui o Chromium que gera o PDF.
Quando os logs pararem de correr, abra http://localhost:3000.

Não tem arquivo para editar. A primeira tela pede a sua chave da DeepSeek, confere com a DeepSeek
sem gastar crédito e salva. Daí em diante o app te leva pelos seis passos acima. Dá para trocar a
chave e ver o saldo depois, em **Configurações**.

| Para | Rode |
|---|---|
| Subir de novo depois | `docker compose up` |
| Parar | `docker compose stop` |
| Atualizar para uma versão nova | `git pull`, depois `docker compose up --build` |
| Apagar todos os dados | `docker compose down -v` |
| Ver os logs | `docker compose logs -f api worker` |

## Stack

| Camada | Escolha |
|---|---|
| Monorepo | pnpm workspaces e Turborepo |
| Frontend | Next.js e TypeScript (`apps/web`) |
| Backend | NestJS (`apps/api`), com um worker BullMQ como segundo entrypoint da mesma imagem |
| Banco | PostgreSQL 16 via Drizzle |
| Fila | Redis 7 |
| IA | DeepSeek-V4-Flash, API oficial |
| Leitura do PDF | `@firecrawl/pdf-inspector` |
| Geração do PDF | Chromium via `playwright-core`, paginado pelo Paged.js, A4 |
| Testes | Vitest, mais Playwright e axe para o fluxo no navegador |

## Estrutura do repositório

| Caminho | O que tem |
|---|---|
| `apps/web` | O app Next.js: telas de importação, revisão do perfil, vaga, avaliação, adaptação, revisão do currículo e exportação |
| `apps/api` | A API NestJS (`src/main.ts`) e o worker da fila (`src/main.worker.ts`) |
| `packages/schema` | Schema do banco, migrações e os contratos de requisição e resposta que os dois apps usam |
| `packages/resume-templates` | O HTML/CSS do currículo, usado na pré-visualização e no PDF |
| `docs/adr` | Registros das decisões de arquitetura |
| `CONTEXT.md` | Glossário do domínio |

## Desenvolvimento

Você precisa de Node 22 e pnpm (`corepack enable` usa a versão fixada no `package.json`).

```bash
docker compose up -d postgres redis
pnpm install
pnpm lint
pnpm type-check
pnpm test
```

Os testes de integração usam os dois containers acima. Eles conectam em `127.0.0.1`, nunca em
`localhost`: no Windows, `localhost` resolve primeiro para IPv6, e os containers só escutam em IPv4.

Os testes de PDF em `apps/api` precisam do Chromium do Playwright:

```bash
./apps/api/node_modules/.bin/playwright-core install chromium
```

Os testes de navegador ficam em `apps/web/e2e` e não precisam de chave da DeepSeek, porque o harness
simula a IA:

```bash
pnpm --filter web exec playwright install chromium
pnpm --filter web test:e2e
```

Numa máquina com pouca memória, rode um pacote por vez e com menos workers, por exemplo
`pnpm --filter api exec vitest run --maxWorkers=2`.

## Bugs e ideias

Abra uma issue. É um projeto paralelo, então as correções saem conforme eu tenho tempo.

## Licença

[MIT](LICENSE)
