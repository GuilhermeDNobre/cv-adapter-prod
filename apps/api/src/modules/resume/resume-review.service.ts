import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../database/database.provider';
import { findUnsupportedClaims } from './writing/claim-checker';
import { loadResumeCareerMaps } from './writing/resume-career.loader';
import { ResumeEditingRepository, type ReviewBullet } from './resume-editing.repository';

export interface MarkForEvidenceInput {
  readonly userId: string;
  readonly evidenceId: string;
}

export interface MarkForExperienceInput {
  readonly userId: string;
  readonly experienceId: string;
}

export interface ReviewMarker {
  markForEvidence(input: MarkForEvidenceInput): Promise<{ bulletCount: number }>;
  markForExperience(input: MarkForExperienceInput): Promise<{ bulletCount: number }>;
}

interface CareerMaps {
  readonly statementByEvidence: Map<string, string>;
  readonly experienceIdByEvidence: Map<string, string | null>;
  readonly companyByExperience: Map<string, string>;
  readonly roleByExperience: Map<string, string>;
  readonly allStatements: string[];
}

@Injectable()
export class ResumeReviewService implements ReviewMarker {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(ResumeEditingRepository) private readonly editing: ResumeEditingRepository,
  ) {}

  async markForEvidence(input: MarkForEvidenceInput): Promise<{ bulletCount: number }> {
    const candidates = await this.editing.listReviewBulletsForEvidence(input.userId, input.evidenceId);
    const maps = await this.loadCareerMaps(input.userId);
    const failing = this.collectFailingBullets(candidates, maps);
    const marked = await this.editing.markBulletsNeedingReview(failing);
    console.log('resume.review_marked', { evidenceId: input.evidenceId, bulletCount: marked });
    return { bulletCount: marked };
  }

  async markForExperience(input: MarkForExperienceInput): Promise<{ bulletCount: number }> {
    const candidates = await this.editing.listReviewBulletsForExperience(input.userId, input.experienceId);
    const maps = await this.loadCareerMaps(input.userId);
    const failing = this.collectFailingBullets(candidates, maps);
    const marked = await this.editing.markBulletsNeedingReview(failing);
    console.log('resume.review_marked', { experienceId: input.experienceId, bulletCount: marked });
    return { bulletCount: marked };
  }

  private collectFailingBullets(candidates: readonly ReviewBullet[], maps: CareerMaps): string[] {
    const failing: string[] = [];
    for (const candidate of candidates) {
      const sources = this.buildSources(candidate, maps);
      if (findUnsupportedClaims(candidate.bullet.text, sources).length > 0) {
        failing.push(candidate.bullet.id);
      }
    }
    return failing;
  }

  private buildSources(candidate: ReviewBullet, maps: CareerMaps): string[] {
    if (candidate.sectionKind === 'summary' || candidate.sectionKind === 'skills') {
      return [...maps.allStatements];
    }
    const sources: string[] = [];
    if (candidate.bullet.evidenceId !== null) {
      const statement = maps.statementByEvidence.get(candidate.bullet.evidenceId);
      if (statement !== undefined) {
        sources.push(statement);
      }
    }
    const linkedExperience =
      candidate.entryExperienceId ??
      (candidate.bullet.evidenceId === null
        ? undefined
        : maps.experienceIdByEvidence.get(candidate.bullet.evidenceId) ?? undefined);
    if (linkedExperience !== undefined && linkedExperience !== null) {
      const company = maps.companyByExperience.get(linkedExperience);
      const role = maps.roleByExperience.get(linkedExperience);
      if (company !== undefined && company !== '') {
        sources.push(company);
      }
      if (role !== undefined && role !== '') {
        sources.push(role);
      }
    }
    return sources.length === 0 ? [...maps.allStatements] : sources;
  }

  private async loadCareerMaps(userId: string): Promise<CareerMaps> {
    const career = await loadResumeCareerMaps(this.database, userId);
    if (career === undefined) {
      return {
        statementByEvidence: new Map(),
        experienceIdByEvidence: new Map(),
        companyByExperience: new Map(),
        roleByExperience: new Map(),
        allStatements: [],
      };
    }
    const statementByEvidence = new Map([...career.evidenceById.values()].map((row) => [row.id, row.statement] as const));
    const experienceIdByEvidence = new Map([...career.evidenceById.values()].map((row) => [row.id, row.experienceId] as const));
    const companyByExperience = new Map([...career.experienceById.values()].map((row) => [row.id, row.company] as const));
    const roleByExperience = new Map([...career.experienceById.values()].map((row) => [row.id, row.role] as const));
    const allStatements = [
      ...[...career.evidenceById.values()].map((row) => row.statement),
      ...[...career.experienceById.values()].flatMap((row) => [row.company, row.role]),
      ...[...career.educationById.values()].flatMap((row) => [row.institution, row.degree]),
    ];
    return { statementByEvidence, experienceIdByEvidence, companyByExperience, roleByExperience, allStatements };
  }
}
