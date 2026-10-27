import { describe, expect, it } from 'vitest';
import { createTaskSchema, taskSchema, updateTaskSchema } from '../src/index.js';

describe('public task contracts', () => {
  it('normalizes titles and rejects whitespace, oversized titles, and unexpected properties', () => {
    expect(createTaskSchema.parse({ title: '  Build a feature  ' })).toEqual({
      title: 'Build a feature',
    });
    for (const input of [
      { title: ' ' },
      { title: 'x'.repeat(121) },
      { title: 'Title', admin: true },
    ]) {
      expect(createTaskSchema.safeParse(input).success).toBe(false);
    }
  });

  it('rejects invalid statuses and invalid server response identifiers', () => {
    expect(updateTaskSchema.safeParse({ status: 'deleted' }).success).toBe(false);
    expect(
      taskSchema.safeParse({
        id: 'invalid',
        title: 'Title',
        status: 'open',
        createdAt: 'yesterday',
      }).success,
    ).toBe(false);
  });
});
