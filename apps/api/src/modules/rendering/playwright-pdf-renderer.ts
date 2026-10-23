import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import type { PdfRenderer, PdfRenderResult } from './pdf-renderer';

const RENDER_TIMEOUT_MS = 30_000;
const NO_SANDBOX_FLAG = '--no-sandbox';

@Injectable()
export class PlaywrightPdfRenderer implements PdfRenderer, OnModuleDestroy {
  private browserLaunch: Promise<Browser> | undefined;

  async render(html: string): Promise<PdfRenderResult> {
    const browser = await this.getBrowser();
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.route('**/*', (route) => route.abort());
      page.setDefaultTimeout(RENDER_TIMEOUT_MS);
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      await page.addScriptTag({ content: 'window.PagedConfig = { auto: false };' });
      await page.addScriptTag({ path: this.resolvePagedPath() });
      const pageCount = await page.evaluate<number>('window.PagedPolyfill.preview().then((flow) => flow.total)');
      const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, tagged: true });
      return { pdf, pageCount };
    } finally {
      await context.close();
    }
  }

  async onModuleDestroy(): Promise<void> {
    const launch = this.browserLaunch;
    this.browserLaunch = undefined;
    if (launch !== undefined) {
      const browser = await launch.catch(() => undefined);
      if (browser !== undefined) {
        await browser.close();
      }
    }
  }

  private getBrowser(): Promise<Browser> {
    if (this.browserLaunch === undefined) {
      const launch = this.launchBrowser();
      this.browserLaunch = launch;
      launch.catch(() => {
        if (this.browserLaunch === launch) {
          this.browserLaunch = undefined;
        }
      });
    }
    return this.browserLaunch;
  }

  private async launchBrowser(): Promise<Browser> {
    const browser = await chromium.launch({ args: [NO_SANDBOX_FLAG] });
    browser.on('disconnected', () => {
      this.browserLaunch = undefined;
    });
    return browser;
  }

  private resolvePagedPath(): string {
    const resolver = createRequire(__filename);
    const entry = resolver.resolve('pagedjs');
    return path.join(path.dirname(entry), '..', 'dist', 'paged.polyfill.js');
  }
}
