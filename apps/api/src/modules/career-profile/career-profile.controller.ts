import { Controller, Get, Inject } from '@nestjs/common';
import { LOCAL_USER_ID } from 'schema/local-user';
import type { CareerProfileResponse } from 'schema/contracts/career-profile';
import { CareerProfileService } from './career-profile.service';

@Controller('career-profile')
export class CareerProfileController {
  constructor(
    @Inject(CareerProfileService) private readonly careerProfileService: CareerProfileService,
  ) {}

  @Get()
  getCareerProfile(): Promise<CareerProfileResponse> {
    return this.careerProfileService.getCareerProfile(LOCAL_USER_ID);
  }
}
