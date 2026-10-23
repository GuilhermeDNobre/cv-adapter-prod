import { Module } from '@nestjs/common';
import { PDF_RENDERER } from './pdf-renderer';
import { PlaywrightPdfRenderer } from './playwright-pdf-renderer';

@Module({
  providers: [{ provide: PDF_RENDERER, useClass: PlaywrightPdfRenderer }],
  exports: [PDF_RENDERER],
})
export class RenderingModule {}
