import { describe, expect, it, vi } from 'vitest';
import { ResumeExportController } from './resume-export.controller';
import type { ResumeExportService } from './resume-export.service';

function createController() {
  const exportResume = vi.fn(async () => ({ exportId: 'export-id', pageCount: 1, exceedsLengthTarget: false }));
  const downloadExport = vi.fn(async () => ({ pdf: Buffer.from('pdf-bytes'), filename: 'curriculo-backend.pdf' }));
  const service = { exportResume, downloadExport } as unknown as ResumeExportService;
  return { controller: new ResumeExportController(service), exportResume, downloadExport };
}

describe('ResumeExportController.createExport', () => {
  it('should delegate to the service and return the export summary', async () => {
    const { controller, exportResume } = createController();

    await expect(controller.createExport('resume-id')).resolves.toEqual({
      exportId: 'export-id',
      pageCount: 1,
      exceedsLengthTarget: false,
    });
    expect(exportResume).toHaveBeenCalledWith(expect.any(String), 'resume-id');
  });
});

describe('ResumeExportController.downloadExport', () => {
  it('should return the stored bytes as a pdf attachment', async () => {
    const { controller, downloadExport } = createController();

    const file = await controller.downloadExport('export-id');

    expect(downloadExport).toHaveBeenCalledWith(expect.any(String), 'export-id');
    expect(file).toBeDefined();
    expect(file.getHeaders()).toMatchObject({
      type: 'application/pdf',
      disposition: 'attachment; filename="curriculo-backend.pdf"',
    });
  });
});
