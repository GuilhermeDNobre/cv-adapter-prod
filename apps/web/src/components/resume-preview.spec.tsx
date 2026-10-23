import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import type { RenderableResume } from 'resume-templates';
import { ResumePreview } from './resume-preview';

const SECTION_SUMMARY_ID = '11111111-1111-4111-8111-111111111111';
const SECTION_EXPERIENCE_ID = '22222222-2222-4222-8222-222222222222';
const BULLET_ADDED_ID = '33333333-3333-4333-8333-333333333333';
const BULLET_PLAIN_ID = '44444444-4444-4444-8444-444444444444';

function previewDocument(): RenderableResume {
  return {
    contact: { name: 'Ada Lovelace', email: 'ada@example.com' },
    sections: [
      {
        id: SECTION_SUMMARY_ID,
        kind: 'summary',
        entries: [{ bullets: [{ text: 'Backend engineer with five years of experience.', status: 'assumed' }] }],
      },
      {
        id: SECTION_EXPERIENCE_ID,
        kind: 'experience',
        entries: [
          {
            company: 'Analytical Engines',
            role: 'Engineer',
            period: '2020 - 2024',
            bullets: [{ text: 'Shipped the engine on schedule.', status: 'assumed' }],
          },
        ],
      },
    ],
  };
}

function frameElement(): HTMLIFrameElement {
  const frame = screen.getByTitle('Pré-visualização do currículo');
  if (!(frame instanceof HTMLIFrameElement)) throw new Error('Expected the preview frame');
  return frame;
}

function srcDocOf(frame: HTMLIFrameElement): string {
  return frame.getAttribute('srcdoc') ?? '';
}

function dispatchPreviewMessage(source: unknown, data: unknown): void {
  const event = new MessageEvent('message', { data });
  Object.defineProperty(event, 'source', { value: source });
  window.dispatchEvent(event);
}

function stubFrameSource(frame: HTMLIFrameElement): object {
  const fakeSource = {};
  Object.defineProperty(frame, 'contentWindow', { value: fakeSource, configurable: true });
  return fakeSource;
}

describe('ResumePreview', () => {
  it('should render a titled frame sandboxed to scripts from the same origin', () => {
    render(<ResumePreview document={previewDocument()} template="comfortable" language="pt" />);

    const frame = frameElement();
    expect(frame.getAttribute('sandbox')).toContain('allow-scripts');
    expect(frame.getAttribute('sandbox')).toContain('allow-same-origin');
    expect(screen.getByRole('region', { name: 'Pré-visualização do currículo' })).toBeInTheDocument();
  });

  it('should build the frame from the interactive template with clickable sections', () => {
    render(<ResumePreview document={previewDocument()} template="comfortable" language="pt" />);

    const srcDoc = srcDocOf(frameElement());
    expect(srcDoc).toContain(`data-section-id="${SECTION_SUMMARY_ID}"`);
    expect(srcDoc).toContain(`data-section-id="${SECTION_EXPERIENCE_ID}"`);
    expect(srcDoc).toContain('class="section-trigger"');
    expect(srcDoc).not.toContain('tabindex="0"');
    expect(srcDoc).not.toContain('role="button"');
    expect(srcDoc).toContain('Backend engineer with five years of experience.');
  });

  it('should post bridge messages to window.origin instead of location.origin', () => {
    render(<ResumePreview document={previewDocument()} template="comfortable" language="pt" />);

    const srcDoc = srcDocOf(frameElement());
    expect(srcDoc).not.toContain('location.origin');
    expect(srcDoc).toContain('window.origin');
  });

  it('should scale the paginated content to the frame width with zoom and no hidden overflow', () => {
    render(<ResumePreview document={previewDocument()} template="comfortable" language="pt" />);

    const srcDoc = srcDocOf(frameElement());
    expect(srcDoc).toContain('zoom');
    expect(srcDoc).toContain('794');
    expect(srcDoc).toContain('resize');
    expect(srcDoc).toContain('parseFloat');
    expect(srcDoc).toContain('scrollWidth');
    expect(srcDoc).toContain('getBoundingClientRect');
    expect(srcDoc).not.toContain('overflowX');
    expect(srcDoc).not.toContain('overflow-x');
  });

  it('should rescale as soon as paged content arrives for narrow frames', () => {
    render(<ResumePreview document={previewDocument()} template="comfortable" language="pt" />);

    const srcDoc = srcDocOf(frameElement());
    expect(srcDoc).toContain('MutationObserver');
    expect(srcDoc).toContain('childList');
    expect(srcDoc).toContain('subtree');
  });

  it('should paginate with the locally served Paged.js and make no external request', () => {
    render(<ResumePreview document={previewDocument()} template="dense" language="en" />);

    const srcDoc = srcDocOf(frameElement());
    expect(srcDoc).toContain('<script src="/paged.polyfill.js"></script>');
    expect(srcDoc).not.toContain('https://');
    expect(srcDoc).not.toContain('http://');
    expect(srcDoc).not.toContain('src="http');
    expect(srcDoc).not.toContain('href="http');
    expect(srcDoc).not.toContain('url(http');
    expect(srcDoc.toLowerCase()).not.toContain('tailwind');
  });

  it('should register the preview bridge before the Paged.js download blocks parsing', () => {
    render(<ResumePreview document={previewDocument()} template="comfortable" language="pt" />);

    const srcDoc = srcDocOf(frameElement());
    const bridgeIndex = srcDoc.indexOf('keydown');
    const pagedIndex = srcDoc.indexOf('paged.polyfill.js');
    const configIndex = srcDoc.indexOf('PagedConfig');
    expect(bridgeIndex).toBeGreaterThan(-1);
    expect(pagedIndex).toBeGreaterThan(-1);
    expect(bridgeIndex).toBeLessThan(pagedIndex);
    expect(configIndex).toBeLessThan(pagedIndex);
  });

  it('should announce pagination first and then the reported page total', async () => {
    const onPageCount = vi.fn();
    render(
      <ResumePreview
        document={previewDocument()}
        template="comfortable"
        language="pt"
        onPageCount={onPageCount}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Paginando a pré-visualização.');
    expect(screen.getByText('Contando as páginas.')).toBeInTheDocument();

    const fakeSource = stubFrameSource(frameElement());
    dispatchPreviewMessage(fakeSource, {
      source: 'resume-preview',
      type: 'page-count',
      pageCount: 3,
    });

    expect(onPageCount).toHaveBeenCalledWith(3);
    expect(await screen.findByText('3 páginas')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Pré-visualização paginada: 3 páginas.');
  });

  it('should use the singular label for a single page', async () => {
    render(<ResumePreview document={previewDocument()} template="comfortable" language="pt" />);

    const fakeSource = stubFrameSource(frameElement());
    dispatchPreviewMessage(fakeSource, {
      source: 'resume-preview',
      type: 'page-count',
      pageCount: 1,
    });

    expect(await screen.findByText('1 página')).toBeInTheDocument();
  });

  it('should forward the selected section id to the parent', () => {
    const onSectionSelect = vi.fn();
    render(
      <ResumePreview
        document={previewDocument()}
        template="comfortable"
        language="pt"
        onSectionSelect={onSectionSelect}
      />,
    );

    const fakeSource = stubFrameSource(frameElement());
    dispatchPreviewMessage(fakeSource, {
      source: 'resume-preview',
      type: 'section-selected',
      sectionId: SECTION_EXPERIENCE_ID,
    });

    expect(onSectionSelect).toHaveBeenCalledWith(SECTION_EXPERIENCE_ID);
  });

  it('should ignore messages from other frames and malformed payloads', () => {
    const onPageCount = vi.fn();
    const onSectionSelect = vi.fn();
    render(
      <ResumePreview
        document={previewDocument()}
        template="comfortable"
        language="pt"
        onPageCount={onPageCount}
        onSectionSelect={onSectionSelect}
      />,
    );

    stubFrameSource(frameElement());
    dispatchPreviewMessage({}, { source: 'resume-preview', type: 'page-count', pageCount: 2 });
    const frameSource = frameElement().contentWindow;
    dispatchPreviewMessage(frameSource, { source: 'other-widget', type: 'page-count', pageCount: 2 });
    dispatchPreviewMessage(frameSource, { source: 'resume-preview', type: 'page-count', pageCount: 0 });
    dispatchPreviewMessage(frameSource, {
      source: 'resume-preview',
      type: 'section-selected',
      sectionId: '',
    });
    dispatchPreviewMessage(frameSource, null);

    expect(onPageCount).not.toHaveBeenCalled();
    expect(onSectionSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Paginando a pré-visualização.');
  });

  it('should mark only the highlighted bullets with data-change in the srcDoc', () => {
    const document: RenderableResume = {
      contact: { name: 'Ada Lovelace' },
      sections: [
        {
          id: SECTION_EXPERIENCE_ID,
          kind: 'experience',
          entries: [
            {
              company: 'Acme',
              bullets: [
                { id: BULLET_ADDED_ID, text: 'Added bullet.', status: 'assumed' },
                { id: BULLET_PLAIN_ID, text: 'Plain bullet.', status: 'assumed' },
              ],
            },
          ],
        },
      ],
    };
    render(
      <ResumePreview
        document={document}
        template="comfortable"
        language="pt"
        highlightedBulletIds={[BULLET_ADDED_ID]}
      />,
    );

    const srcDoc = srcDocOf(frameElement());
    expect(srcDoc).toContain(`data-bullet-id="${BULLET_ADDED_ID}"`);
    expect(srcDoc).toContain('data-change="added"');
    expect(srcDoc).toContain('class="change-trigger"');
    const addedIndex = srcDoc.indexOf(`data-bullet-id="${BULLET_ADDED_ID}"`);
    const addedSlice = srcDoc.slice(addedIndex, addedIndex + 200);
    expect(addedSlice).toContain('data-change="added"');
    expect(srcDoc).not.toContain(`data-bullet-id="${BULLET_PLAIN_ID}"`);
    expect(srcDoc).toContain('Plain bullet.');
  });

  it('should expose highlights and sections as native buttons in the bridge', () => {
    render(<ResumePreview document={previewDocument()} template="comfortable" language="pt" />);

    const srcDoc = srcDocOf(frameElement());
    expect(srcDoc).toContain('[data-change]');
    expect(srcDoc).toContain('.change-trigger');
    expect(srcDoc).toContain('.section-trigger');
    expect(srcDoc).not.toContain('tabindex=');
    expect(srcDoc).not.toContain('role="button"');
    expect(srcDoc).not.toContain('Alteração:');
    expect(srcDoc).toContain('change-rect');
    expect(srcDoc).toContain('focus-change');
    expect(srcDoc).toContain('focus-section');
  });

  it('should forward a change-rect message to the change callback', async () => {
    const onChangeSelect = vi.fn();
    render(
      <ResumePreview
        document={previewDocument()}
        template="comfortable"
        language="pt"
        onChangeSelect={onChangeSelect}
      />,
    );

    const frame = frameElement();
    const fakeSource = stubFrameSource(frame);
    const rect = { top: 10, left: 20, width: 100, height: 30 };
    await act(async () => {
      dispatchPreviewMessage(fakeSource, {
        source: 'resume-preview',
        type: 'change-rect',
        bulletId: BULLET_ADDED_ID,
        rect,
      });
    });

    expect(onChangeSelect).toHaveBeenCalledTimes(1);
    const selection = onChangeSelect.mock.calls[0]?.[0] as {
      bulletId: string;
      rect: typeof rect;
      frameRect: { top: number; left: number };
    };
    expect(selection.bulletId).toBe(BULLET_ADDED_ID);
    expect(selection.rect).toEqual(rect);
    expect(selection.frameRect).toEqual({ top: 0, left: 0 });
    expect(selection).not.toHaveProperty('zoom');
  });

  it('should include the iframe border in the reported frame origin', async () => {
    const onChangeSelect = vi.fn();
    render(
      <ResumePreview
        document={previewDocument()}
        template="comfortable"
        language="pt"
        onChangeSelect={onChangeSelect}
      />,
    );

    const frame = frameElement();
    const fakeSource = stubFrameSource(frame);
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      left: 50,
      bottom: 700,
      right: 650,
      width: 600,
      height: 600,
      x: 50,
      y: 100,
      toJSON: () => {},
    });
    Object.defineProperty(frame, 'clientTop', { value: 1, configurable: true });
    Object.defineProperty(frame, 'clientLeft', { value: 2, configurable: true });
    await act(async () => {
      dispatchPreviewMessage(fakeSource, {
        source: 'resume-preview',
        type: 'change-rect',
        bulletId: BULLET_ADDED_ID,
        rect: { top: 10, left: 20, width: 100, height: 30 },
      });
    });

    expect(onChangeSelect).toHaveBeenCalledTimes(1);
    const selection = onChangeSelect.mock.calls[0]?.[0] as {
      frameRect: { top: number; left: number };
    };
    expect(selection.frameRect).toEqual({ top: 101, left: 52 });
  });

  it('should ignore a change-rect without a bullet id', () => {
    const onChangeSelect = vi.fn();
    render(
      <ResumePreview
        document={previewDocument()}
        template="comfortable"
        language="pt"
        onChangeSelect={onChangeSelect}
      />,
    );

    const fakeSource = stubFrameSource(frameElement());
    dispatchPreviewMessage(fakeSource, {
      source: 'resume-preview',
      type: 'change-rect',
      bulletId: '',
      rect: { top: 0, left: 0, width: 10, height: 10 },
    });

    expect(onChangeSelect).not.toHaveBeenCalled();
  });

  it('should forward a skill proposal change-rect to the change callback', async () => {
    const onChangeSelect = vi.fn();
    render(
      <ResumePreview
        document={previewDocument()}
        template="comfortable"
        language="pt"
        onChangeSelect={onChangeSelect}
      />,
    );

    const SKILL_PROPOSAL_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const fakeSource = stubFrameSource(frameElement());
    const rect = { top: 5, left: 6, width: 50, height: 20 };
    await act(async () => {
      dispatchPreviewMessage(fakeSource, {
        source: 'resume-preview',
        type: 'change-rect',
        bulletId: '',
        skillProposalId: SKILL_PROPOSAL_ID,
        rect,
      });
    });

    expect(onChangeSelect).toHaveBeenCalledTimes(1);
    const selection = onChangeSelect.mock.calls[0]?.[0] as {
      bulletId: string | null;
      skillProposalId: string | null;
      rect: typeof rect;
    };
    expect(selection.bulletId).toBeNull();
    expect(selection.skillProposalId).toBe(SKILL_PROPOSAL_ID);
    expect(selection.rect).toEqual(rect);
  });

  it('should ignore a change-rect without any change id', () => {
    const onChangeSelect = vi.fn();
    render(
      <ResumePreview
        document={previewDocument()}
        template="comfortable"
        language="pt"
        onChangeSelect={onChangeSelect}
      />,
    );

    const fakeSource = stubFrameSource(frameElement());
    dispatchPreviewMessage(fakeSource, {
      source: 'resume-preview',
      type: 'change-rect',
      bulletId: '',
      skillProposalId: '',
      rect: { top: 0, left: 0, width: 10, height: 10 },
    });

    expect(onChangeSelect).not.toHaveBeenCalled();
  });

  it('should expose skill proposal handling in the bridge', () => {
    render(<ResumePreview document={previewDocument()} template="comfortable" language="pt" />);

    const srcDoc = srcDocOf(frameElement());
    expect(srcDoc).toContain('data-skill-proposal-id');
    expect(srcDoc).toContain('skillProposalId');
  });

  it('should post a focus-change request to the frame when asked', async () => {
    const { rerender } = render(
      <ResumePreview document={previewDocument()} template="comfortable" language="pt" />,
    );

    const frame = frameElement();
    const postMessage = vi.fn();
    Object.defineProperty(frame, 'contentWindow', { value: { postMessage }, configurable: true });

    await act(async () => {
      rerender(
        <ResumePreview
          document={previewDocument()}
          template="comfortable"
          language="pt"
          focusBulletId={BULLET_ADDED_ID}
        />,
      );
    });

    expect(postMessage).toHaveBeenCalledWith(
      { type: 'focus-change', bulletId: BULLET_ADDED_ID, skillProposalId: '' },
      '*',
    );
  });

  it('should post a skill focus-change request to the frame when asked', async () => {
    const SKILL_PROPOSAL_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const { rerender } = render(
      <ResumePreview document={previewDocument()} template="comfortable" language="pt" />,
    );

    const frame = frameElement();
    const postMessage = vi.fn();
    Object.defineProperty(frame, 'contentWindow', { value: { postMessage }, configurable: true });

    await act(async () => {
      rerender(
        <ResumePreview
          document={previewDocument()}
          template="comfortable"
          language="pt"
          focusSkillProposalId={SKILL_PROPOSAL_ID}
        />,
      );
    });

    expect(postMessage).toHaveBeenCalledWith(
      { type: 'focus-change', bulletId: '', skillProposalId: SKILL_PROPOSAL_ID },
      '*',
    );
  });
});
