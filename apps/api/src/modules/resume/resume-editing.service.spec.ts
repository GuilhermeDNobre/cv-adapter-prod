import { describe, expect, it, vi } from 'vitest';
import { ResumeEditingService } from './resume-editing.service';

const USER_ID = '00000000-0000-0000-0000-000000000001';
const BULLET_ID = '44444444-4444-4444-8444-444444444444';
const SECTION_ID = '22222222-2222-4222-8222-222222222222';
const RESUME_ID = '6a1e4f8c-0b5a-4e6b-8d0a-2f3c5d7e9a01';
const COMMENT_ID = '77777777-7777-4777-8777-777777777777';

function makeEditing() {
  return {
    findOwnedBullet: vi.fn(),
    updateBulletText: vi.fn().mockResolvedValue(undefined),
    findOwnedSection: vi.fn(),
    createSectionComment: vi.fn().mockResolvedValue('new-comment-id'),
    resolveSectionComment: vi.fn(),
    readSectionState: vi.fn(),
    writeUndoSnapshot: vi.fn().mockResolvedValue(undefined),
    readUndoSnapshot: vi.fn(),
    restoreSectionState: vi.fn().mockResolvedValue(undefined),
    markGenerating: vi.fn().mockResolvedValue(undefined),
  };
}

function makeResumes() {
  return { getResume: vi.fn().mockResolvedValue({ id: RESUME_ID }) };
}

function makeQueue() {
  return { add: vi.fn().mockResolvedValue(undefined) };
}

describe('ResumeEditingService', () => {
  it('should save the edited text clearing needs_review without touching the claim checker', async () => {
    const editing = makeEditing();
    editing.findOwnedBullet.mockResolvedValue({ bullet: { id: BULLET_ID }, resumeId: RESUME_ID });
    const resumes = makeResumes();
    const service = new ResumeEditingService(editing as never, resumes as never, makeQueue() as never);

    await service.updateBullet(USER_ID, BULLET_ID, { text: 'Cut latency in half.' });

    expect(editing.updateBulletText).toHaveBeenCalledWith(BULLET_ID, 'Cut latency in half.');
    expect(resumes.getResume).toHaveBeenCalledWith(RESUME_ID, USER_ID);
  });

  it('should create a comment scoped to its own section', async () => {
    const editing = makeEditing();
    editing.findOwnedSection.mockResolvedValue({ section: { id: SECTION_ID }, resume: { id: RESUME_ID } });
    const resumes = makeResumes();
    const service = new ResumeEditingService(editing as never, resumes as never, makeQueue() as never);

    await service.createSectionComment(USER_ID, SECTION_ID, { text: 'Shorter.' });

    expect(editing.createSectionComment).toHaveBeenCalledWith(SECTION_ID, 'Shorter.');
    expect(resumes.getResume).toHaveBeenCalledWith(RESUME_ID, USER_ID);
  });

  it('should resolve a comment by id', async () => {
    const editing = makeEditing();
    editing.resolveSectionComment.mockResolvedValue(RESUME_ID);
    const resumes = makeResumes();
    const service = new ResumeEditingService(editing as never, resumes as never, makeQueue() as never);

    await service.resolveSectionComment(USER_ID, COMMENT_ID);

    expect(editing.resolveSectionComment).toHaveBeenCalledWith(USER_ID, COMMENT_ID);
    expect(resumes.getResume).toHaveBeenCalledWith(RESUME_ID, USER_ID);
  });

  it('should snapshot the section before rewriting and restore it on undo', async () => {
    const editing = makeEditing();
    editing.findOwnedSection.mockResolvedValue({ section: { id: SECTION_ID }, resume: { id: RESUME_ID } });
    editing.readSectionState.mockResolvedValue({ entries: [{ id: 'e1' }], bullets: [{ id: 'b1' }] });
    editing.readUndoSnapshot.mockResolvedValue({ entries: [{ id: 'e1' }], bullets: [{ id: 'b1' }] });
    const resumes = makeResumes();
    const queue = makeQueue();
    const service = new ResumeEditingService(editing as never, resumes as never, queue as never);
    await service.requestSectionRewrite(USER_ID, SECTION_ID, 'Make it shorter.');
    expect(editing.writeUndoSnapshot).toHaveBeenCalledWith(SECTION_ID, { entries: [{ id: 'e1' }], bullets: [{ id: 'b1' }] });
    expect(queue.add).toHaveBeenCalledWith(
      'rewrite-section',
      { resumeId: RESUME_ID, userId: USER_ID, sectionId: SECTION_ID, instruction: 'Make it shorter.' },
      expect.anything(),
    );
    await service.undoSectionRewrite(USER_ID, SECTION_ID);
    expect(editing.restoreSectionState).toHaveBeenCalledWith(SECTION_ID, { entries: [{ id: 'e1' }], bullets: [{ id: 'b1' }] });
  });
});
