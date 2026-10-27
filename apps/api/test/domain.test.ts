import { describe, expect, it } from 'vitest';
import { Task } from '../dist/modules/tasks/domain/task.js';
import { CreateTask } from '../dist/modules/tasks/application/create-task.js';
import { ChangeTaskStatus } from '../dist/modules/tasks/application/change-task-status.js';
import { MemoryTaskRepository } from '../dist/modules/tasks/infrastructure/memory-task.repository.js';

describe('task behavior independent of Nest and PostgreSQL', () => {
  it('keeps domain invariants and snapshots isolated', () => {
    const task = Task.create({
      id: 'task-id',
      title: '  Build well  ',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    Object.assign(task.toSnapshot(), { title: 'changed outside the entity' });
    expect(task.toSnapshot().title).toBe('Build well');
    expect(() => Task.create({ id: 'id', title: ' ', createdAt: 'now' })).toThrow();
  });

  it('creates deterministic tasks through injected identity and clock dependencies', async () => {
    const repository = new MemoryTaskRepository();
    const create = new CreateTask(
      repository,
      () => 'stable-id',
      () => new Date('2026-01-01T00:00:00Z'),
    );
    const task = await create.execute('  Ship it  ');
    expect(task.toSnapshot()).toEqual({
      id: 'stable-id',
      title: 'Ship it',
      status: 'open',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const change = new ChangeTaskStatus(repository);
    expect((await change.execute('stable-id', 'done')).toSnapshot().status).toBe('done');
    await expect(change.execute('missing', 'done')).rejects.toThrow('Task was not found');
  });

  it('bounds recent results and sorts ties consistently', async () => {
    const repository = new MemoryTaskRepository();
    for (let index = 0; index < 105; index++) {
      await repository.add(
        Task.create({
          id: String(index).padStart(3, '0'),
          title: 'Task',
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
      );
    }
    const result = await repository.listRecent();
    expect(result).toHaveLength(100);
    expect(result[0]?.id).toBe('104');
    expect(result[99]?.id).toBe('005');
  });
});
