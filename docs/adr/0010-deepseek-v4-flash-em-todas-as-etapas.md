# DeepSeek-V4-Flash em todas as etapas, na API oficial

O pipeline tem etapas de perfis diferentes — extração, plano, redação, reescrita por **Comment** e
tradução — e a decisão natural seria escolher um modelo por etapa. Decidimos o contrário: **um
único modelo, DeepSeek-V4-Flash, em todas elas, chamado direto na API oficial.**

A economia justifica com folga. A US$ 0,14 por milhão de tokens de entrada e US$ 0,28 de saída, uma
adaptação completa (plano com cerca de 15k de entrada mais um filho por **Section**) fica na casa
de **US$ 0,005, menos de R$ 0,03**. Isso transforma a decisão do ADR 0006 — edições ilimitadas
dentro de um **Credit** — de aposta em folga confortável. O contexto de 1M de tokens também elimina
qualquer preocupação com **Career Profile** grande.

Um modelo só significa um formato de resposta, um tratamento de erro e um lugar para ajustar
comportamento.

## Consequências

- **O modelo base não tem visão**, e isso mudou o desenho da importação (ver ADR 0011). O
  `deepseek-v4-flash-vision-exp` é experimental, publicado em 21/08/2026, com limite indicado de
  384 tokens por imagem, o que é pouco para uma página densa em duas colunas. Não é base para o
  passo mais crítico do produto.
- Sem contrato de retenção zero, o custo de privacidade foi aceito conscientemente e está
  documentado no ADR 0008, junto com a transferência internacional.
- A escolha é reversível a baixo custo: o mesmo modelo é servido por gateways ocidentais, e trocar
  é mudar endpoint e credencial, não prompt.
- A dependência de um provedor único também é ponto de falha único. Precisa existir uma resposta
  para "a API caiu no meio de uma adaptação já cobrada", que hoje é o retry do job por **Section**.

## Alternativas rejeitadas

- **Modelo forte no plano e barato na redação** — a redação é a superfície que a pessoa lê, e com
  o custo nesse patamar não há economia relevante a capturar.
- **Gateway ocidental (OpenRouter, Vercel AI Gateway, Together)** — resolveria o conflito com o
  ADR 0008 mantendo o mesmo modelo, ao custo de markup e de mais um intermediário.
- **Self-hosted** — satisfaz privacidade trivialmente, mas troca R$ 0,03 por adaptação por custo
  fixo de GPU, além de uptime e escala virarem problema nosso.
