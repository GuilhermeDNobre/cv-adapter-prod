import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  careerProfiles,
  certifications,
  contactDetails,
  educationEntries,
  evidences,
  experiences,
  languages,
  resumeImports,
  skills,
} from 'schema';
import { resumeImportIdSchema } from 'schema/contracts/resume-import';
import type { CareerProfileResponse } from 'schema/contracts/career-profile';
import { DATABASE, type Database } from '../database/database.provider';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage';
import { materializeDraft, InvalidDraftDateError, type MaterializedDraft } from './draft-materializer';
import {
  isSameCertification,
  isSameEducation,
  isSameEvidence,
  isSameExperience,
  isSameLanguage,
  isSameSkill,
} from './profile-merge';

const CONFIRMABLE_STATUSES = ['ready_for_review'] as const;

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

@Injectable()
export class CareerProfileService {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(OBJECT_STORAGE) private readonly objectStorage: ObjectStorage,
  ) {}

  async confirmResumeImport(resumeImportId: string, userId: string): Promise<void> {
    const { row, materialized, importId } = await this.loadConfirmableImport(resumeImportId, userId);
    const draftSummary =
      row.draft !== null && typeof row.draft === 'object' && 'summary' in row.draft
        ? (row.draft as { summary?: unknown }).summary
        : undefined;
    const summary =
      typeof draftSummary === 'string' && draftSummary.trim() !== ''
        ? draftSummary.trim()
        : (row.summary ?? null);
    await this.database.transaction(async (tx) => {
      const careerProfileId = await this.findOrCreateCareerProfile(tx, userId);
      await this.upsertContactDetails(tx, careerProfileId, materialized.contactDetails);
      const experienceIds = await this.mergeExperiences(tx, careerProfileId, materialized.experiences);
      await this.mergeEducationEntries(tx, careerProfileId, materialized.educationEntries);
      await this.mergeEvidences(tx, careerProfileId, { evidences: materialized.evidences, experienceIds });
      await this.mergeSkills(tx, careerProfileId, materialized.skills);
      await this.mergeLanguages(tx, careerProfileId, materialized.languages);
      await this.mergeCertifications(tx, careerProfileId, materialized.certifications);
      await tx
        .update(resumeImports)
        .set({ status: 'confirmed', summary, updatedAt: new Date() })
        .where(eq(resumeImports.id, importId));
    });
    if (row.storageKey !== null) {
      await this.objectStorage.removeSourceDocument(row.storageKey);
    }
  }

  async getCareerProfile(userId: string): Promise<CareerProfileResponse> {
    const [profile] = await this.database
      .select({ id: careerProfiles.id })
      .from(careerProfiles)
      .where(eq(careerProfiles.userId, userId));
    if (profile === undefined) {
      throw new NotFoundException('Career profile not found.');
    }
    const experienceRows = await this.database
      .select()
      .from(experiences)
      .where(eq(experiences.careerProfileId, profile.id));
    const educationRows = await this.database
      .select()
      .from(educationEntries)
      .where(eq(educationEntries.careerProfileId, profile.id));
    const evidenceRows = await this.database
      .select()
      .from(evidences)
      .where(eq(evidences.careerProfileId, profile.id));
    const skillRows = await this.database
      .select()
      .from(skills)
      .where(eq(skills.careerProfileId, profile.id));
    const languageRows = await this.database
      .select()
      .from(languages)
      .where(eq(languages.careerProfileId, profile.id));
    const certificationRows = await this.database
      .select()
      .from(certifications)
      .where(eq(certifications.careerProfileId, profile.id));
    console.log('career_profile.read', { profileId: profile.id });
    return {
      experiences: experienceRows.map((row) => ({
        id: row.id,
        company: row.company,
        role: row.role,
        startedOn: row.startedOn,
        endedOn: row.endedOn,
      })),
      educationEntries: educationRows.map((row) => ({
        id: row.id,
        institution: row.institution,
        degree: row.degree,
        startedOn: row.startedOn,
        endedOn: row.endedOn,
      })),
      evidences: evidenceRows.map((row) => ({
        id: row.id,
        statement: row.statement,
        experienceId: row.experienceId,
      })),
      skills: skillRows.map((row) => ({
        id: row.id,
        name: row.name,
        group: row.group,
      })),
      languages: languageRows.map((row) => ({
        id: row.id,
        name: row.name,
        level: row.level,
      })),
      certifications: certificationRows.map((row) => ({
        id: row.id,
        name: row.name,
        issuer: row.issuer,
        year: row.year,
      })),
    };
  }

  private async loadConfirmableImport(
    resumeImportId: string,
    userId: string,
  ): Promise<{ row: typeof resumeImports.$inferSelect; materialized: MaterializedDraft; importId: string }> {
    const parsedId = resumeImportIdSchema.safeParse(resumeImportId);
    if (!parsedId.success) {
      throw new NotFoundException('Resume import not found.');
    }
    const [row] = await this.database
      .select()
      .from(resumeImports)
      .where(eq(resumeImports.id, parsedId.data));
    if (row === undefined || row.userId !== userId) {
      throw new NotFoundException('Resume import not found.');
    }
    if (!(CONFIRMABLE_STATUSES as readonly string[]).includes(row.status)) {
      throw new ConflictException('Resume import is not in a confirmable state.');
    }
    const draft = row.draft;
    if (draft === null || typeof draft !== 'object') {
      throw new ConflictException('Resume import has no draft to confirm.');
    }
    try {
      const materialized = materializeDraft(draft as Parameters<typeof materializeDraft>[0]);
      return { row, materialized, importId: parsedId.data };
    } catch (error) {
      if (error instanceof InvalidDraftDateError) {
        throw new UnprocessableEntityException({
          code: 'invalid_draft_date',
          field: error.field,
          message: 'A date in the draft is not in a supported format.',
        });
      }
      throw error;
    }
  }

  private async findOrCreateCareerProfile(tx: Transaction, userId: string): Promise<string> {
    const [profile] = await tx
      .select()
      .from(careerProfiles)
      .where(eq(careerProfiles.userId, userId));
    if (profile !== undefined) {
      return profile.id;
    }
    const [created] = await tx
      .insert(careerProfiles)
      .values({ userId })
      .returning({ id: careerProfiles.id });
    if (created === undefined) {
      throw new Error('Failed to create career profile');
    }
    return created.id;
  }

  private async upsertContactDetails(
    tx: Transaction,
    careerProfileId: string,
    details: MaterializedDraft['contactDetails'],
  ): Promise<void> {
    await tx
      .insert(contactDetails)
      .values({
        careerProfileId,
        fullName: details.fullName,
        email: details.email,
        phone: details.phone,
        city: details.city,
        links: details.links,
      })
      .onConflictDoUpdate({
        target: contactDetails.careerProfileId,
        set: {
          fullName: details.fullName,
          email: details.email,
          phone: details.phone,
          city: details.city,
          links: details.links,
        },
      });
  }

  private async mergeExperiences(
    tx: Transaction,
    careerProfileId: string,
    incoming: MaterializedDraft['experiences'],
  ): Promise<string[]> {
    const storedExperiences = await tx
      .select()
      .from(experiences)
      .where(eq(experiences.careerProfileId, careerProfileId));
    const knownExperiences = storedExperiences.map((row) => ({
      id: row.id,
      company: row.company,
      role: row.role,
      startedOn: row.startedOn,
      endedOn: row.endedOn,
    }));
    const experienceIds: string[] = [];
    for (const exp of incoming) {
      const match = knownExperiences.find((known) => isSameExperience(known, exp));
      if (match !== undefined && match.endedOn !== exp.endedOn) {
        await tx.update(experiences).set({ endedOn: exp.endedOn }).where(eq(experiences.id, match.id));
        match.endedOn = exp.endedOn;
      }
      if (match !== undefined) {
        experienceIds.push(match.id);
        continue;
      }
      const [created] = await tx
        .insert(experiences)
        .values({
          careerProfileId,
          company: exp.company,
          role: exp.role,
          startedOn: exp.startedOn,
          endedOn: exp.endedOn,
        })
        .returning({ id: experiences.id });
      if (created === undefined) {
        throw new Error('Failed to create experience');
      }
      experienceIds.push(created.id);
      knownExperiences.push({ id: created.id, company: exp.company, role: exp.role, startedOn: exp.startedOn, endedOn: exp.endedOn });
    }
    return experienceIds;
  }

  private async mergeEducationEntries(
    tx: Transaction,
    careerProfileId: string,
    incoming: MaterializedDraft['educationEntries'],
  ): Promise<void> {
    const storedEducation = await tx
      .select()
      .from(educationEntries)
      .where(eq(educationEntries.careerProfileId, careerProfileId));
    const knownEducation = storedEducation.map((row) => ({
      id: row.id,
      institution: row.institution,
      degree: row.degree,
      startedOn: row.startedOn,
      endedOn: row.endedOn,
    }));
    for (const edu of incoming) {
      const match = knownEducation.find((known) => isSameEducation(known, edu));
      if (match !== undefined && match.endedOn !== edu.endedOn) {
        await tx.update(educationEntries).set({ endedOn: edu.endedOn }).where(eq(educationEntries.id, match.id));
        match.endedOn = edu.endedOn;
      }
      if (match !== undefined) {
        continue;
      }
      const [created] = await tx
        .insert(educationEntries)
        .values({
          careerProfileId,
          institution: edu.institution,
          degree: edu.degree,
          startedOn: edu.startedOn,
          endedOn: edu.endedOn,
        })
        .returning({ id: educationEntries.id });
      if (created === undefined) {
        throw new Error('Failed to create education entry');
      }
      knownEducation.push({ id: created.id, institution: edu.institution, degree: edu.degree, startedOn: edu.startedOn, endedOn: edu.endedOn });
    }
  }

  private async mergeEvidences(
    tx: Transaction,
    careerProfileId: string,
    args: { evidences: MaterializedDraft['evidences']; experienceIds: string[] },
  ): Promise<void> {
    const storedEvidences = await tx
      .select()
      .from(evidences)
      .where(eq(evidences.careerProfileId, careerProfileId));
    const knownEvidences = storedEvidences.map((row) => ({
      experienceId: row.experienceId,
      statement: row.statement,
    }));
    for (const ev of args.evidences) {
      const experienceId =
        ev.experienceIndex !== null ? args.experienceIds[ev.experienceIndex] ?? null : null;
      const candidate = { experienceId, statement: ev.statement };
      if (knownEvidences.some((known) => isSameEvidence(known, candidate))) {
        continue;
      }
      await tx.insert(evidences).values({
        careerProfileId,
        experienceId,
        statement: ev.statement,
      });
      knownEvidences.push(candidate);
    }
  }

  private async mergeSkills(
    tx: Transaction,
    careerProfileId: string,
    incoming: MaterializedDraft['skills'],
  ): Promise<void> {
    const storedSkills = await tx
      .select()
      .from(skills)
      .where(eq(skills.careerProfileId, careerProfileId));
    const knownSkills = storedSkills.map((row) => ({ name: row.name }));
    let maxOrdinal = storedSkills.reduce((max, row) => Math.max(max, row.ordinal), -1);
    const orderedIncoming = [...incoming].sort((left, right) => left.ordinal - right.ordinal);
    for (const skill of orderedIncoming) {
      if (knownSkills.some((known) => isSameSkill(known, skill))) {
        continue;
      }
      maxOrdinal += 1;
      await tx.insert(skills).values({
        careerProfileId,
        name: skill.name,
        group: skill.group,
        ordinal: maxOrdinal,
      });
      knownSkills.push({ name: skill.name });
    }
  }

  private async mergeLanguages(
    tx: Transaction,
    careerProfileId: string,
    incoming: MaterializedDraft['languages'],
  ): Promise<void> {
    const storedLanguages = await tx
      .select()
      .from(languages)
      .where(eq(languages.careerProfileId, careerProfileId));
    const knownLanguages = storedLanguages.map((row) => ({ name: row.name }));
    for (const language of incoming) {
      if (knownLanguages.some((known) => isSameLanguage(known, language))) {
        continue;
      }
      await tx.insert(languages).values({
        careerProfileId,
        name: language.name,
        level: language.level,
      });
      knownLanguages.push({ name: language.name });
    }
  }

  private async mergeCertifications(
    tx: Transaction,
    careerProfileId: string,
    incoming: MaterializedDraft['certifications'],
  ): Promise<void> {
    const storedCertifications = await tx
      .select()
      .from(certifications)
      .where(eq(certifications.careerProfileId, careerProfileId));
    const knownCertifications = storedCertifications.map((row) => ({ name: row.name }));
    for (const certification of incoming) {
      if (knownCertifications.some((known) => isSameCertification(known, certification))) {
        continue;
      }
      await tx.insert(certifications).values({
        careerProfileId,
        name: certification.name,
        issuer: certification.issuer,
        year: certification.year,
      });
      knownCertifications.push({ name: certification.name });
    }
  }
}
