import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ItemRefinementController, RefineItemPipe, refineItemRequestSchema } from './item-refinement.controller';

const SECTION_ID = '22222222-2222-4222-8222-222222222222';

describe('refineItemRequestSchema', () => {
  it('should accept text between 1 and 1000 characters', () => {
    expect(refineItemRequestSchema.safeParse({ text: 'Led team.' }).success).toBe(true);
    expect(refineItemRequestSchema.safeParse({ text: 'a'.repeat(1000) }).success).toBe(true);
  });

  it('should reject empty text and text above 1000 characters', () => {
    expect(refineItemRequestSchema.safeParse({ text: '' }).success).toBe(false);
    expect(refineItemRequestSchema.safeParse({ text: '   ' }).success).toBe(false);
    expect(refineItemRequestSchema.safeParse({ text: 'a'.repeat(1001) }).success).toBe(false);
    expect(refineItemRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('RefineItemPipe', () => {
  it('should reject an invalid body with 400', () => {
    const pipe = new RefineItemPipe();
    expect(() => pipe.transform({ text: '' })).toThrow(BadRequestException);
  });
});

describe('ItemRefinementController', () => {
  it('should delegate to the service without storing anything', async () => {
    const refinement = { refine: vi.fn(async () => ({ refined: 'Refined.' })) };
    const controller = new ItemRefinementController(refinement as never);

    const result = await controller.refineItem(SECTION_ID, { text: 'led team' });

    expect(result).toEqual({ refined: 'Refined.' });
    expect(refinement.refine).toHaveBeenCalledWith(expect.objectContaining({ sectionId: SECTION_ID, text: 'led team' }));
  });
});
