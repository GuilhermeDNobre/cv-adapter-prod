import { describe, expect, it } from 'vitest';
import { DataErasureController } from './data-erasure.controller';
import { DataErasureModule } from './data-erasure.module';
import { DataErasureService } from './data-erasure.service';

describe('DataErasureModule', () => {
  it('should expose the erasure service', () => {
    const exports: unknown[] = Reflect.getMetadata('exports', DataErasureModule);

    expect(exports).toContain(DataErasureService);
  });

  it('should register the data erasure controller', () => {
    const controllers: unknown[] = Reflect.getMetadata('controllers', DataErasureModule);

    expect(controllers).toContain(DataErasureController);
  });
});
