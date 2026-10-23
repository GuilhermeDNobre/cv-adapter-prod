import { BadRequestException, type PipeTransform } from '@nestjs/common';

const NO_FILE_MESSAGE = 'No file was uploaded. Send a PDF, LaTeX, or HTML file.';

interface MulterFile {
  readonly buffer: Buffer;
  readonly originalname: string;
  readonly mimetype: string;
}

export interface UploadedSourceDocument {
  readonly buffer: Buffer;
  readonly originalName: string;
  readonly mimeType: string;
}

export class UploadSourceDocumentPipe implements PipeTransform<MulterFile, UploadedSourceDocument> {
  transform(file: MulterFile | undefined): UploadedSourceDocument {
    if (file === undefined) {
      throw new BadRequestException(NO_FILE_MESSAGE);
    }
    return {
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
    };
  }
}
