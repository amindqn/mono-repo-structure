export type TaskStatus = 'open' | 'done';
export interface TaskSnapshot {
  readonly id: string;
  readonly ownerId: string;
  readonly title: string;
  readonly status: TaskStatus;
  readonly createdAt: string;
}

/** Immutable domain entity. HTTP and database representations stay outside this class. */
export class Task {
  private constructor(private readonly state: TaskSnapshot) {}

  static create(input: { id: string; ownerId: string; title: string; createdAt: string }): Task {
    const title = input.title.trim();
    if (!title || title.length > 120)
      throw new Error('A task title must contain 1 to 120 characters');
    return new Task({ ...input, title, status: 'open' });
  }

  static restore(snapshot: TaskSnapshot): Task {
    return new Task({ ...snapshot });
  }

  get id() {
    return this.state.id;
  }

  toSnapshot(): TaskSnapshot {
    return { ...this.state };
  }
}
