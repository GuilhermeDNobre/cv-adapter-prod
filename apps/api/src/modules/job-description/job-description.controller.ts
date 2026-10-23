import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import type {
  CreateJobDescriptionRequest,
  JobDescriptionResponse,
} from 'schema/contracts/job-description';
import { CreateJobDescriptionPipe } from './job-description.dto';
import { JobDescriptionService } from './job-description.service';

@Controller('job-descriptions')
export class JobDescriptionController {
  constructor(
    @Inject(JobDescriptionService) private readonly jobDescriptionService: JobDescriptionService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  createJobDescription(
    @Body(new CreateJobDescriptionPipe()) body: CreateJobDescriptionRequest,
  ): Promise<JobDescriptionResponse> {
    return this.jobDescriptionService.createJobDescription(body.text);
  }

  @Get(':jobDescriptionId')
  readJobDescription(
    @Param('jobDescriptionId') jobDescriptionId: string,
  ): Promise<JobDescriptionResponse> {
    return this.jobDescriptionService.getJobDescription(jobDescriptionId);
  }
}
