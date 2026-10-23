import { describe, expect, it } from 'vitest';
import { renderResumeHtml, type RenderableResume, type ResumeContact, type ResumeSection, type ResumeTemplateName } from 'resume-templates';
import { PlaywrightPdfRenderer } from './playwright-pdf-renderer';
function buildContact(): ResumeContact {
  return {
    name: 'Alexandra Mendes Costa',
    email: 'alexandra.costa@example.com',
    phone: '+55 11 90000-0000',
    city: 'Sao Paulo, SP',
    links: ['linkedin.com/in/alexandra-costa', 'github.com/alexandra-costa'],
  };
}
function buildSummarySection(): ResumeSection {
  return {
    id: 'summary',
    kind: 'summary',
    entries: [{ bullets: [{ text: 'Software engineering student seeking a fullstack internship with React, Node.js and NestJS, focused on modern web technologies and delivering scalable end-to-end solutions in agile teams with clean code.', status: 'assumed' }] }],
  };
}
function buildSkillsSection(): ResumeSection {
  return {
    id: 'skills',
    kind: 'skills',
    entries: [
      { heading: 'Linguagens', bullets: [{ text: 'JavaScript/TypeScript, Java e Python para APIs backend e apps em producao.', status: 'assumed' }] },
      { heading: 'Back-end', bullets: [{ text: 'Fastify, NestJS, Spring Boot e Node.js com REST, OpenAPI e testes automatizados.', status: 'assumed' }] },
      { heading: 'Front-end', bullets: [{ text: 'React, Next.js, HTML5, CSS3 e Tailwind CSS com layouts responsivos e design systems.', status: 'assumed' }] },
      { heading: 'Banco de Dados', bullets: [{ text: 'PostgreSQL, MongoDB, Redis e RabbitMQ rodando em Docker com backups diarios.', status: 'assumed' }] },
      { heading: 'DevOps', bullets: [{ text: 'Git e GitHub, Docker, CI e CD com GitHub Actions, Scrum e revisoes de codigo.', status: 'assumed' }] },
      { heading: 'Idiomas', bullets: [{ text: 'Portugues: Nativo', status: 'assumed' }, { text: 'Ingles: Avancado (C1)', status: 'assumed' }] },
    ],
  };
}
function buildFirstExperiences(): ResumeSection[] {
  return [
    {
      id: 'experience-1',
      kind: 'experience',
      entries: [{ company: 'Empresa Ficticia Alfa Solucoes', role: 'Desenvolvedora Full Stack', period: 'Mar 2023 - Jun 2024', bullets: [{ text: 'Desenhou e entregou sozinha uma plataforma SaaS do zero ao deploy com cobranca, auth e email transacional diario.', status: 'assumed' }, { text: 'Construiu API REST em Fastify e TypeScript com MongoDB e object storage, documentada em OpenAPI Swagger completo.', status: 'assumed' }] }],
    },
    {
      id: 'experience-2',
      kind: 'experience',
      entries: [{ company: 'Fundacao Ficticia Beta Educacional', role: 'Tutora de Programacao', period: 'Jul 2022 - Dez 2022', bullets: [{ text: 'Integrou pagamentos PIX e cartao com validacao de webhook HMAC, retries automaticos e rotinas de conciliacao.', status: 'assumed' }, { text: 'Construiu wizard multi-etapas em React com formularios validados, mapas interativos e animacoes suaves de onboarding.', status: 'assumed' }, { text: 'Cobriu o produto com testes unitarios e de integracao somando dezenas de suites automatizadas executadas no CI.', status: 'assumed' }, { text: 'Configurou CI e CD a cada push com builds, testes e deploys automaticos mais revisao assistida por IA generativa.', status: 'assumed' }] }],
    },
  ];
}
function buildLastExperiences(): ResumeSection[] {
  return [
    {
      id: 'experience-3',
      kind: 'experience',
      entries: [{ company: 'Loja Ficticia Gama Comercio', role: 'Estagiaria de Desenvolvimento Web', period: 'Jun 2021 - Dez 2021', bullets: [{ text: 'Desenvolveu catalogo de produtos em JavaScript vanilla e Bootstrap, melhorando a presenca digital da loja ficticia.', status: 'assumed' }] }],
    },
    {
      id: 'experience-4',
      kind: 'experience',
      entries: [{ company: 'Laboratorio Ficticio Delta', role: 'Monitora Voluntaria de Logica', period: 'Jan 2021 - Mai 2021', bullets: [{ text: 'Apoiou oficinas de logica de programacao com jogos e IA, revisando exercicios com acompanhamento individual semanal.', status: 'assumed' }] }],
    },
  ];
}
function buildEducationSection(): ResumeSection {
  return {
    id: 'education',
    kind: 'education',
    entries: [
      { institution: 'Universidade Ficticia do Norte (UFN)', role: 'Bacharelado em Engenharia de Software', period: '2021 - Presente', bullets: [] },
      { institution: 'Escola Ficticia Tecnica Central', role: 'Curso Tecnico em Informatica', period: '2018 - 2020', bullets: [] },
    ],
  };
}
function buildTexVolumeFixture(): RenderableResume {
  return { contact: buildContact(), sections: [buildSummarySection(), buildSkillsSection(), ...buildFirstExperiences(), ...buildLastExperiences(), buildEducationSection()] };
}
describe('tex volume single page', () => {
  it.each(['comfortable', 'dense'] as const)(
    'should fit the tex volume in one page for %s',
    async (template: ResumeTemplateName) => {
      // Arrange
      const fixture = buildTexVolumeFixture();
      const html = renderResumeHtml(fixture, { template, language: 'pt', mode: 'print' });
      const renderer = new PlaywrightPdfRenderer();
      // Act
      const result = await renderer.render(html);
      await renderer.onModuleDestroy();
      // Assert
      expect(result.pageCount).toBe(1);
      expect(result.pdf.length).toBeGreaterThan(0);
    },
    60000,
  );
});
