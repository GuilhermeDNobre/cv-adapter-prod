# HTML/CSS como formato único de template, PDF via Chromium headless

O editor mostra um documento paginado em que a pessoa clica numa **Section** para comentar, e isso
só existe em HTML — nenhum editor clicável é construído sobre um PDF renderizado. Se o PDF fosse
gerado por outro motor (LaTeX, Typst, react-pdf), cada template existiria duas vezes, em HTML para
o preview e no formato do motor para o export, e as duas cópias divergiriam. Mesmo com um punhado de
**Templates** curados por nós, são o dobro de artefatos mantidos em sincronia para sempre, e todo
ajuste visual vira edição dupla.

Decidimos: **o template é HTML + CSS de impressão, e é o mesmo artefato que alimenta o preview e a
geração do PDF.** Chromium headless não foi escolhido por ser o melhor motor de PDF, e sim por ser
o único que consome exatamente o artefato que o editor já produz.

## Consequências

- A geração de PDF fica atrás da porta `render(html) -> pdf`, fora do processo da API. O adapter
  inicial é o Cloudflare Browser Rendering, na mesma plataforma do R2, o que mantém o consumo de
  memória da nossa infraestrutura em zero. Trocar por um container próprio com Playwright é
  substituir uma implementação da porta.
- A taxa de render acompanha o número de downloads, não o de edições: o preview é HTML no browser
  e não custa nada no servidor.
- Fontes precisam ser embutidas e o CSS resolvido localmente, para que o render seja determinístico
  e não dependa de rede.
- Paginação é responsabilidade de CSS de impressão (`@page`, `break-inside`), que é a parte
  genuinamente trabalhosa desta escolha.

## Alternativas rejeitadas

- **WeasyPrint** — evita o Chromium, mas é outro motor de CSS (flexbox parcial, sem grid), então o
  preview no browser e o PDF divergiriam, além de trazer um runtime Python para um projeto NestJS.
- **LaTeX / Typst** — tipografia superior, mas template duplicado e escapar texto da pessoa para
  `.tex` é superfície de bug e de injeção.
- **react-pdf** — template duplicado, e clicar numa Section viraria overlay de coordenadas sobre o
  PDF.
- **Gerar o PDF no cliente** — não produz um blob confiável e o PDF precisa ser guardado no R2.

## Revisões

- Templates enviados pela pessoa saíram de escopo. Esse argumento era um amplificador, não a
  fundação: a decisão se sustenta apenas no preview editável ser HTML, o que já obriga qualquer
  outro motor de PDF a manter uma segunda definição de cada template.
