import { z } from 'zod';
import { apiRequest } from './api-client';

const refineItemResponseSchema = z.object({
  refined: z.string().min(1),
});

export type RefineItemResponse = z.infer<typeof refineItemResponseSchema>;

export async function refineSectionItem(
  sectionId: string,
  request: { readonly text: string },
): Promise<RefineItemResponse> {
  return await apiRequest({
    path: `/sections/${sectionId}/refine-item`,
    method: 'POST',
    body: request,
    responseSchema: refineItemResponseSchema,
  });
}
