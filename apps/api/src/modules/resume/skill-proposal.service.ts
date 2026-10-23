import { Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { careerProfiles, resumeSections, resumeSkillProposals, resumes, skills } from 'schema';
import { resumeIdSchema } from 'schema/contracts/resume';
import { z } from 'zod';
import { DATABASE, type Database } from '../database/database.provider';

const proposalIdSchema = z.string().uuid();

export interface SkillProposalDecisionInput {
  readonly resumeId: string;
  readonly proposalId: string;
  readonly userId: string;
}

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

@Injectable()
export class SkillProposalService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async accept(input: SkillProposalDecisionInput): Promise<string> {
    const resumeId = this.requireResumeId(input.resumeId);
    const proposalId = this.requireProposalId(input.proposalId);
    await this.database.transaction(async (tx) => {
      const proposal = await this.requireOwnedProposal(tx, resumeId, input.userId, proposalId);
      if (proposal.status !== 'pending') {
        throw new UnprocessableEntityException('Skill proposal is already resolved.');
      }
      if (proposal.kind === 'addition') {
        await this.ensureProfileSkill(tx, input.userId, proposal.name, proposal.group);
      }
      await tx
        .update(resumeSkillProposals)
        .set({ status: 'accepted' })
        .where(eq(resumeSkillProposals.id, proposal.id));
      await tx.update(resumes).set({ updatedAt: new Date() }).where(eq(resumes.id, resumeId));
    });
    console.log('resume.skill_proposal.accepted', { resumeId, proposalId });
    return resumeId;
  }

  async reject(input: SkillProposalDecisionInput): Promise<string> {
    const resumeId = this.requireResumeId(input.resumeId);
    const proposalId = this.requireProposalId(input.proposalId);
    await this.database.transaction(async (tx) => {
      const proposal = await this.requireOwnedProposal(tx, resumeId, input.userId, proposalId);
      if (proposal.status !== 'pending') {
        throw new UnprocessableEntityException('Skill proposal is already resolved.');
      }
      await tx
        .update(resumeSkillProposals)
        .set({ status: 'rejected' })
        .where(eq(resumeSkillProposals.id, proposal.id));
      await tx.update(resumes).set({ updatedAt: new Date() }).where(eq(resumes.id, resumeId));
    });
    console.log('resume.skill_proposal.rejected', { resumeId, proposalId });
    return resumeId;
  }

  private requireResumeId(resumeId: string): string {
    const parsed = resumeIdSchema.safeParse(resumeId);
    if (!parsed.success) {
      throw new NotFoundException('Resume not found.');
    }
    return parsed.data;
  }

  private requireProposalId(proposalId: string): string {
    const parsed = proposalIdSchema.safeParse(proposalId);
    if (!parsed.success) {
      throw new NotFoundException('Skill proposal not found.');
    }
    return parsed.data;
  }

  private async requireOwnedProposal(
    tx: Transaction,
    resumeId: string,
    userId: string,
    proposalId: string,
  ) {
    const [resume] = await tx
      .select({ id: resumes.id })
      .from(resumes)
      .where(and(eq(resumes.id, resumeId), eq(resumes.userId, userId)));
    if (resume === undefined) {
      throw new NotFoundException('Resume not found.');
    }
    const [proposal] = await tx
      .select()
      .from(resumeSkillProposals)
      .where(eq(resumeSkillProposals.id, proposalId));
    if (proposal === undefined) {
      throw new NotFoundException('Skill proposal not found.');
    }
    const [section] = await tx
      .select({ id: resumeSections.id, resumeId: resumeSections.resumeId })
      .from(resumeSections)
      .where(eq(resumeSections.id, proposal.sectionId));
    if (section === undefined || section.resumeId !== resume.id) {
      throw new NotFoundException('Skill proposal not found.');
    }
    return proposal;
  }

  private async ensureProfileSkill(
    tx: Transaction,
    userId: string,
    name: string,
    group: string | null,
  ): Promise<void> {
    const [profile] = await tx
      .select({ id: careerProfiles.id })
      .from(careerProfiles)
      .where(eq(careerProfiles.userId, userId));
    if (profile === undefined) {
      throw new NotFoundException('Career profile not found.');
    }
    const existing = await tx
      .select()
      .from(skills)
      .where(eq(skills.careerProfileId, profile.id));
    const wanted = name.toLowerCase();
    if (existing.some((skill) => skill.name.toLowerCase() === wanted)) {
      return;
    }
    const maxOrdinal = existing.reduce((max, skill) => Math.max(max, skill.ordinal ?? 0), -1);
    await tx.insert(skills).values({
      careerProfileId: profile.id,
      name,
      group,
      ordinal: maxOrdinal + 1,
    });
  }
}
