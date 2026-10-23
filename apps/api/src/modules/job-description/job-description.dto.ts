import { BadRequestException, type PipeTransform } from '@nestjs/common';
import {
  createJobDescriptionRequestSchema,
  type CreateJobDescriptionRequest,
} from 'schema/contracts/job-description';

export class CreateJobDescriptionPipe implements PipeTransform<unknown, CreateJobDescriptionRequest> {
  transform(value: unknown): CreateJobDescriptionRequest {
    const result = createJobDescriptionRequestSchema.safeParse(value);
    if (!result.success) {
      const [issue] = result.error.issues;
      throw new BadRequestException(issue === undefined ? 'Invalid request body.' : issue.message);
    }
    return result.data;
  }
}
