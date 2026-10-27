export class TaskNotFound extends Error {
  constructor() {
    super('Task was not found');
    this.name = 'TaskNotFound';
  }
}
