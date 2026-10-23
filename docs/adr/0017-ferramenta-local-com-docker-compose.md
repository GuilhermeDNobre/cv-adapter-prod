# O projeto é uma ferramenta local, não um produto hospedado

O cv-adapter nasceu como produto: contas, créditos, pagamento, hospedagem gerenciada,
observabilidade. Essa camada cresceu mais rápido que o núcleo e passou a dominar o trabalho — a
última fatia inteira foi deploy e observabilidade, sem entregar nada que adaptasse um currículo
melhor.

Decidimos: **o cv-adapter roda inteiro na máquina de quem usa, com `docker compose up`, e cada
pessoa usa a própria chave da DeepSeek.**

- **Quatro containers:** `postgres`, `redis`, `api`, `web`. Nada fora da máquina.
- **Sem login.** Uma instância é de uma pessoa. Quem quiser rodar, sobe a sua.
- **Sem créditos e sem pagamento.** O custo da IA é o da chave de quem roda, cobrado pela DeepSeek
  direto.
- **A chave da DeepSeek é fornecida em tempo de execução**, pela interface, e guardada no Postgres
  local. Não vai para o repositório nem para variável de build.
- **O dado é apagável por quem é dono dele**, com botão na interface: limpar currículos gerados ou
  zerar o banco.

## Consequências

- `docker compose up` passa a ser o único caminho de instalação, e precisa funcionar numa máquina
  limpa. Se ele quebrar, não existe produto.
- O que era gerenciado vira responsabilidade do compose: o PDF deixa de sair do Cloudflare Browser
  Rendering e passa a ser gerado por um Chromium dentro do container da API; o arquivo deixa de ir
  para o R2 e fica no Postgres ou num volume.
- **A única coisa que sai da máquina é o que vai para a API da DeepSeek.** É o que sobra do ADR
  0008, e é a única frase de privacidade que o projeto precisa.
- Diagnóstico é `docker compose logs`. Não há Sentry para consultar, e é suficiente para um
  usuário só.
- Seis ADRs foram supersedidos de uma vez: 0003, 0006, 0007, 0013, 0015 e 0016.
- O núcleo de domínio não muda: Career Profile, Evidence, Requirement, Gap, Match Score, adaptação
  em duas etapas e os templates continuam valendo, com os testes que já existem.

## Alternativas rejeitadas

- **Começar um projeto novo do zero** — o incômodo era com a camada em volta, não com o núcleo.
  Recomeçar jogaria fora o schema, os prompts, os templates e 582 testes para reescrever o mesmo
  domínio.
- **Manter a hospedagem e só desligar a cobrança** — continuaria exigindo contas em Fly, Neon e
  Upstash, e continuaria custando dinheiro e manutenção para servir uma pessoa.
- **Rodar sem Docker, com pnpm dev** — obriga cada pessoa a instalar e subir Postgres e Redis na
  mão. `docker compose up` é justamente o que torna isso um comando só.

## Atualização de 2026-09-17

- **O arquivo enviado fica no Postgres**, numa coluna `bytea`, atrás da porta `ObjectStorage` que já
  existe. Venceu o volume do compose porque o arquivo é pequeno (até 10 MB) e temporário, e porque
  "zerar o banco" (etapa 3) passa a apagar tudo num lugar só. Custo aceito: o dump do banco cresce
  enquanto houver importação não confirmada.
- **O Chromium sai da etapa do `docker compose up`.** A revisão de 2026-09-17 mostrou que não há
  geração de PDF no código — nem template, nem a porta `render(html) -> pdf` do ADR 0001; a menção a
  "templates" acima descreve o plano, não o que existia. O Chromium entra na imagem da API quando a
  exportação do Tailored Resume for construída.
- **São cinco containers, não quatro**: `postgres`, `redis`, `api`, `worker` e `web`. O worker é o
  segundo entrypoint da API (`main.worker.ts`) e roda na mesma imagem, com outro comando. Venceu
  rodar os dois processos no container `api` — o PID 1 viraria um shell, o desligamento por sinal
  deixaria de funcionar, e um worker morto não derrubaria o container — e embutir o worker no
  processo da API, que desfaria a separação de `worker.module.ts` e exigiria mudar código e testes.
