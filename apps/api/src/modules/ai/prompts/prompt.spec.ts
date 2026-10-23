import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { clearPromptRegistryForTests, getPrompt, registerPrompt } from './prompt';

const stubSchema = z.object({ value: z.string() });

describe('prompt registry', () => {
  beforeEach(() => {
    clearPromptRegistryForTests();
  });

  it('should register a prompt whose system message contains the word json', () => {
    registerPrompt({
      name: 'evaluate-coverage',
      systemMessage: 'Return only a json object.',
      outputSchema: stubSchema,
    });

    expect(getPrompt('evaluate-coverage').systemMessage).toBe('Return only a json object.');
  });

  it('should accept the json keyword in any casing', () => {
    registerPrompt({
      name: 'extract-resume-draft',
      systemMessage: 'Answer with JSON, nothing else.',
      outputSchema: stubSchema,
    });

    expect(getPrompt('extract-resume-draft').systemMessage).toBe('Answer with JSON, nothing else.');
  });

  it('should reject at registration a prompt whose system message lacks json', () => {
    expect(() =>
      registerPrompt({
        name: 'parse-job-description',
        systemMessage: 'Return the requirements as structured data.',
        outputSchema: stubSchema,
      }),
    ).toThrow(/must contain the word "json"/);
  });

  it('should register parse-job-description successfully', () => {
    registerPrompt({
      name: 'parse-job-description',
      systemMessage: 'Return the requirements as a json object.',
      outputSchema: stubSchema,
    });

    expect(getPrompt('parse-job-description').systemMessage).toBe(
      'Return the requirements as a json object.',
    );
  });

  it('should fail lookup for a prompt name that was never registered', () => {
    expect(() => getPrompt('parse-job-description')).toThrow(/is not registered/);
  });
});
