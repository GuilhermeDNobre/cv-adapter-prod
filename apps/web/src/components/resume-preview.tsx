'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { renderResumeHtml } from 'resume-templates';
import type {
  RenderableResume,
  ResumeLanguage,
  ResumeTemplateName,
} from 'resume-templates';
import { StatusRegion } from './status-region';
import type { ChangeRect, FrameOffset } from './review/to-host-rect';

const PAGED_SCRIPT_SRC = '/paged.polyfill.js';
const PREVIEW_MESSAGE_SOURCE = 'resume-preview';
const FRAME_TITLE = 'Pré-visualização do currículo';
const PAGINATING_MESSAGE = 'Paginando a pré-visualização.';

const POLL_INTERVAL_MS = 250;
const STABLE_READS_TO_REPORT = 3;
const MAX_POLLS = 120;

const pageCountFormatter = new Intl.NumberFormat('pt-BR');

function formatPageCount(pageCount: number): string {
  const formatted = pageCountFormatter.format(pageCount);
  return pageCount === 1 ? `${formatted} página` : `${formatted} páginas`;
}

export interface PreviewChangeSelection {
  readonly bulletId: string | null;
  readonly skillProposalId: string | null;
  readonly rect: ChangeRect;
  readonly frameRect: FrameOffset;
}

type PreviewParentMessage =
  | { readonly source: 'resume-preview'; readonly type: 'page-count'; readonly pageCount: number }
  | {
      readonly source: 'resume-preview';
      readonly type: 'section-selected';
      readonly sectionId: string;
    }
  | {
      readonly source: 'resume-preview';
      readonly type: 'change-rect';
      readonly bulletId: string | null;
      readonly skillProposalId: string | null;
      readonly rect: ChangeRect;
    };

function isChangeRect(value: unknown): value is ChangeRect {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['top'] === 'number' &&
    typeof candidate['left'] === 'number' &&
    typeof candidate['width'] === 'number' &&
    typeof candidate['height'] === 'number'
  );
}

function previewMessageOf(data: unknown): PreviewParentMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const candidate = data as Record<string, unknown>;
  if (candidate['source'] !== PREVIEW_MESSAGE_SOURCE) return null;
  if (candidate['type'] === 'page-count') {
    const pageCount = candidate['pageCount'];
    if (typeof pageCount !== 'number' || !Number.isInteger(pageCount) || pageCount < 1) {
      return null;
    }
    return { source: PREVIEW_MESSAGE_SOURCE, type: 'page-count', pageCount };
  }
  if (candidate['type'] === 'section-selected') {
    const sectionId = candidate['sectionId'];
    if (typeof sectionId !== 'string' || sectionId.trim() === '') return null;
    return { source: PREVIEW_MESSAGE_SOURCE, type: 'section-selected', sectionId };
  }
  if (candidate['type'] === 'change-rect') {
    const rawBulletId = candidate['bulletId'];
    const rawSkillProposalId = candidate['skillProposalId'];
    const bulletId =
      typeof rawBulletId === 'string' && rawBulletId.trim() !== '' ? rawBulletId : null;
    const skillProposalId =
      typeof rawSkillProposalId === 'string' && rawSkillProposalId.trim() !== ''
        ? rawSkillProposalId
        : null;
    if (bulletId === null && skillProposalId === null) return null;
    if (!isChangeRect(candidate['rect'])) return null;
    return {
      source: PREVIEW_MESSAGE_SOURCE,
      type: 'change-rect',
      bulletId,
      skillProposalId,
      rect: candidate['rect'],
    };
  }
  return null;
}

// Paged.js runs inside the frame and exposes no completion promise to a static srcDoc,
// so the bridge reports stability: the same positive page total three polls in a row.
// The bounded fallback posts the best count seen so the screen never waits forever.
// Display scaling is also in the bridge: the paginated content is wider than a bare
// A4 page, so the scale shrinks it with CSS zoom to the frame width, keeping only
// vertical scrolling. The scale is applied as soon as Paged.js inserts the pages
// (MutationObserver) so a narrow frame already shows the fitted sheet on first paint.
// The scale is computed proportionally from the page's own right
// edge at the current zoom, never by resetting the zoom to 1 first (that flips the
// effective media-query width and measures another regime), and verified in a short
// loop that also absorbs late layout shifts. The template HTML is untouched. The scale is computed proportionally from the page's own right
// edge at the current zoom, never by resetting the zoom to 1 first (that flips the
// effective media-query width and measures another regime), and verified in a short
// loop that also absorbs late layout shifts. The template HTML is untouched.
//
// Change highlights live in the same bridge: every .change-trigger button reports
// its rect on click, and answers focus-change requests from the parent by scrolling
// to the trecho and focusing it. Section titles are native .section-trigger buttons:
// a mouse click anywhere in the section selects it, the keyboard uses the title
// button, and focus-section requests from the parent focus that button.
const PREVIEW_BRIDGE_SCRIPT = `<script>
(function () {
  var SOURCE = 'resume-preview';
  var POLL_INTERVAL_MS = ${String(POLL_INTERVAL_MS)};
  var STABLE_READS_TO_REPORT = ${String(STABLE_READS_TO_REPORT)};
  var MAX_POLLS = ${String(MAX_POLLS)};
  var FALLBACK_CONTENT_WIDTH_PX = 794;
  function post(message) {
    window.parent.postMessage(message, window.origin);
  }
  function currentPageCount() {
    return document.querySelectorAll('.pagedjs_page').length;
  }
  function currentZoom() {
    var parsed = parseFloat(document.body.style.zoom);
    if (isNaN(parsed) || parsed <= 0) return 1;
    return parsed;
  }
  function applyScale() {
    var frameWidth = document.documentElement.clientWidth;
    if (!frameWidth || frameWidth <= 0) return;
    for (var step = 0; step < 3; step += 1) {
      var page = document.querySelector('.pagedjs_page');
      if (!(page instanceof HTMLElement)) {
        document.body.style.zoom = '1';
        var fallbackWidth = document.documentElement.scrollWidth || FALLBACK_CONTENT_WIDTH_PX;
        var fallbackScale = frameWidth / fallbackWidth;
        document.body.style.zoom = String(fallbackScale > 1 ? 1 : fallbackScale);
        return;
      }
      var zoom = currentZoom();
      var right = page.getBoundingClientRect().right;
      if (right <= 0) return;
      if (right <= frameWidth + 0.5) return;
      var scale = (zoom * frameWidth) / right;
      if (scale > 1) scale = 1;
      document.body.style.zoom = String(scale);
    }
  }
  function changeOf(target) {
    if (!(target instanceof Element)) return null;
    return target.closest('[data-change]');
  }
  function notifyChange(element) {
    var bulletId = element.getAttribute('data-bullet-id') || '';
    var skillProposalId = element.getAttribute('data-skill-proposal-id') || '';
    if (bulletId === '' && skillProposalId === '') return;
    var box = element.getBoundingClientRect();
    post({
      source: SOURCE,
      type: 'change-rect',
      bulletId: bulletId,
      skillProposalId: skillProposalId,
      rect: { top: box.top, left: box.left, width: box.width, height: box.height }
    });
  }
  function focusChange(bulletId, skillProposalId) {
    var target = null;
    if (typeof bulletId === 'string' && bulletId !== '') {
      var escapedBullet = bulletId.replace(/"/g, '');
      target = document.querySelector('[data-bullet-id="' + escapedBullet + '"]');
    }
    if (target === null && typeof skillProposalId === 'string' && skillProposalId !== '') {
      var escapedSkill = skillProposalId.replace(/"/g, '');
      target = document.querySelector('[data-skill-proposal-id="' + escapedSkill + '"]');
    }
    if (!(target instanceof HTMLElement)) return;
    if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest' });
    }
    target.focus({ preventScroll: true });
    if (target.hasAttribute('data-change')) {
      notifyChange(target);
    }
  }
  function focusSection(sectionId) {
    var escaped = sectionId.replace(/"/g, '');
    var element = document.querySelector('.section-trigger[data-section-id="' + escaped + '"]');
    if (!(element instanceof HTMLElement)) return;
    if (typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'nearest' });
    }
    element.focus({ preventScroll: true });
  }
  window.addEventListener('resize', applyScale);
  window.addEventListener('load', applyScale);
  if (typeof MutationObserver !== 'undefined' && document.documentElement) {
    new MutationObserver(function () {
      applyScale();
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  if ('fonts' in document && document.fonts !== undefined && document.fonts.ready !== undefined) {
    document.fonts.ready.then(function () {
      applyScale();
    });
  }
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (typeof data !== 'object' || data === null) return;
    if (data.type === 'focus-change') {
      var bulletId = typeof data.bulletId === 'string' ? data.bulletId : '';
      var skillProposalId = typeof data.skillProposalId === 'string' ? data.skillProposalId : '';
      if (bulletId === '' && skillProposalId === '') return;
      focusChange(bulletId, skillProposalId);
      return;
    }
    if (data.type === 'focus-section') {
      if (typeof data.sectionId !== 'string' || data.sectionId === '') return;
      focusSection(data.sectionId);
    }
  });
  var lastCount = -1;
  var stableReads = 0;
  var polls = 0;
  var reported = false;
  function report(count) {
    if (reported) return;
    reported = true;
    applyScale();
    post({ source: SOURCE, type: 'page-count', pageCount: count });
  }
  function poll() {
    if (reported) return;
    polls += 1;
    var count = currentPageCount();
    if (count > 0 && count === lastCount) {
      stableReads += 1;
    } else {
      stableReads = 0;
      lastCount = count;
    }
    if (stableReads >= STABLE_READS_TO_REPORT) {
      report(count);
      return;
    }
    if (polls >= MAX_POLLS) {
      report(lastCount > 0 ? lastCount : 1);
      return;
    }
    window.setTimeout(poll, POLL_INTERVAL_MS);
  }
  function notifySection(element) {
    var sectionId = element.getAttribute('data-section-id');
    if (sectionId !== null && sectionId !== '') {
      post({ source: SOURCE, type: 'section-selected', sectionId: sectionId });
    }
  }
  function sectionOf(target) {
    if (!(target instanceof Element)) return null;
    return target.closest('[data-section-id]');
  }
  document.addEventListener('click', function (event) {
    var change = changeOf(event.target);
    if (change !== null) {
      notifyChange(change);
      return;
    }
    var section = sectionOf(event.target);
    if (section !== null) notifySection(section);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    var change = changeOf(event.target);
    if (change !== null) {
      event.preventDefault();
      notifyChange(change);
      return;
    }
    var section = sectionOf(event.target);
    if (section !== null) {
      event.preventDefault();
      notifySection(section);
    }
  });
  applyScale();
  poll();
})();
</script>`;

function withHighlightedDocument(
  document: RenderableResume,
  highlightedBulletIds: readonly string[],
): RenderableResume {
  if (highlightedBulletIds.length === 0) return document;
  const highlighted = new Set(highlightedBulletIds);
  return {
    contact: document.contact,
    sections: document.sections.map((section) => ({
      ...section,
      entries: section.entries.map((entry) => ({
        ...entry,
        bullets: entry.bullets.map((bullet) =>
          bullet.id !== undefined && highlighted.has(bullet.id)
            ? { ...bullet, change: 'added' as const }
            : bullet,
        ),
      })),
    })),
  };
}

function buildPreviewSrcDoc(
  document: RenderableResume,
  template: ResumeTemplateName,
  language: ResumeLanguage,
): string {
  const resumeHtml = renderResumeHtml(document, { template, language, mode: 'interactive' });
  const pagedScripts = `<script>window.PagedConfig = { auto: true };</script>\n${PREVIEW_BRIDGE_SCRIPT}\n<script src="${PAGED_SCRIPT_SRC}"></script>`;
  if (!resumeHtml.includes('</body>')) return `${resumeHtml}\n${pagedScripts}`;
  return resumeHtml.replace('</body>', `${pagedScripts}\n</body>`);
}

interface ResumePreviewProps {
  readonly document: RenderableResume;
  readonly template: ResumeTemplateName;
  readonly language: ResumeLanguage;
  readonly highlightedBulletIds?: readonly string[];
  readonly focusBulletId?: string | null;
  readonly focusSkillProposalId?: string | null;
  readonly focusToken?: number;
  readonly onSectionSelect?: (sectionId: string) => void;
  readonly onPageCount?: (pageCount: number) => void;
  readonly onChangeSelect?: (selection: PreviewChangeSelection) => void;
}

export function ResumePreview({
  document,
  template,
  language,
  highlightedBulletIds = [],
  focusBulletId = null,
  focusSkillProposalId = null,
  focusToken = 0,
  onSectionSelect,
  onPageCount,
  onChangeSelect,
}: ResumePreviewProps): React.JSX.Element {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const onChangeSelectRef = useRef(onChangeSelect);
  onChangeSelectRef.current = onChangeSelect;
  const renderedDocument = useMemo(
    () => withHighlightedDocument(document, highlightedBulletIds),
    [document, highlightedBulletIds],
  );
  const srcDoc = useMemo(
    () => buildPreviewSrcDoc(renderedDocument, template, language),
    [renderedDocument, template, language],
  );

  useEffect(() => {
    setPageCount(null);
  }, [srcDoc]);

  useEffect(() => {
    function handleMessage(event: MessageEvent): void {
      if (event.source !== frameRef.current?.contentWindow) return;
      const message = previewMessageOf(event.data);
      if (message === null) return;
      if (message.type === 'page-count') {
        setPageCount(message.pageCount);
        onPageCount?.(message.pageCount);
      } else if (message.type === 'section-selected') {
        onSectionSelect?.(message.sectionId);
      } else {
        const frame = frameRef.current;
        const box = frame?.getBoundingClientRect();
        const frameRect: FrameOffset = {
          top: (box?.top ?? 0) + (frame?.clientTop ?? 0),
          left: (box?.left ?? 0) + (frame?.clientLeft ?? 0),
        };
        onChangeSelectRef.current?.({
          bulletId: message.bulletId,
          skillProposalId: message.skillProposalId,
          rect: message.rect,
          frameRect,
        });
      }
    }
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [onSectionSelect, onPageCount]);

  useEffect(() => {
    const bulletId = focusBulletId ?? '';
    const skillProposalId = focusSkillProposalId ?? '';
    if (bulletId === '' && skillProposalId === '') return;
    const target = frameRef.current?.contentWindow as
      | { readonly postMessage?: unknown }
      | null
      | undefined;
    if (target === undefined || target === null) return;
    if (typeof target.postMessage !== 'function') return;
    const post = target.postMessage as (message: unknown, targetOrigin: string) => void;
    post.call(target, { type: 'focus-change', bulletId, skillProposalId }, '*');
  }, [focusBulletId, focusSkillProposalId, focusToken, srcDoc]);

  return (
    <section aria-label={FRAME_TITLE} className="flex min-w-0 flex-col gap-2">
      <iframe
        ref={frameRef}
        title={FRAME_TITLE}
        srcDoc={srcDoc}
        sandbox="allow-scripts allow-same-origin"
        className="h-[842px] w-full rounded bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.08)]"
      />
      {pageCount === null ? (
        <p className="text-sm text-text-2">Contando as páginas.</p>
      ) : (
        <p className="text-sm font-medium tabular-nums text-text">{formatPageCount(pageCount)}</p>
      )}
      <StatusRegion>
        {pageCount === null
          ? PAGINATING_MESSAGE
          : `Pré-visualização paginada: ${formatPageCount(pageCount)}.`}
      </StatusRegion>
    </section>
  );
}
