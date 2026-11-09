import { randomUUID } from 'node:crypto';
import type { CreateTaskInput, HistoryEntry, Task, UpdateTaskInput } from './schema.js';

export interface TaskStore {
  list(filter?: {
    status?: Task['status'] | undefined;
    owner?: string | undefined;
    dueBefore?: string | undefined;
    dueAfter?: string | undefined;
    overdue?: boolean | undefined;
  }): Task[];
  get(id: string): Task | undefined;
  create(input: CreateTaskInput): Task;
  update(id: string, input: UpdateTaskInput): Task | undefined;
  remove(id: string): boolean;
}

type Clock = () => Date;

export function createMemoryStore(clock: Clock = () => new Date()): TaskStore {
  const tasks = new Map<string, Task>();

  return {
    list(filter) {
      const all = [...tasks.values()];
      const today = clock().toISOString().slice(0, 10);
      return all.filter(
        (t) =>
          (filter?.status === undefined || t.status === filter.status) &&
          (filter?.owner === undefined || t.owner === filter.owner) &&
          (filter?.dueBefore === undefined ||
            (t.dueDate !== null && t.dueDate < filter.dueBefore)) &&
          (filter?.dueAfter === undefined || (t.dueDate !== null && t.dueDate > filter.dueAfter)) &&
          (!filter?.overdue || (t.dueDate !== null && t.dueDate < today && t.status !== 'done')),
      );
    },

    get(id) {
      return tasks.get(id);
    },

    create(input) {
      const now = clock().toISOString();
      const task: Task = {
        id: randomUUID(),
        title: input.title,
        description: input.description,
        owner: input.owner ?? null,
        status: 'todo',
        dueDate: input.dueDate ?? null,
        createdAt: now,
        updatedAt: now,
        history: [],
      };
      tasks.set(task.id, task);
      return task;
    },

    update(id, input) {
      const current = tasks.get(id);
      if (!current) return undefined;
      const now = clock().toISOString();
      const history: HistoryEntry[] = [];
      const next: Task = { ...current };

      for (const field of ['title', 'description', 'owner', 'status', 'dueDate'] as const) {
        const value = input[field];
        if (value === undefined || value === current[field]) continue;
        history.push({ at: now, field, from: current[field], to: value });
        Object.assign(next, { [field]: value });
      }

      if (history.length === 0) return current;
      next.updatedAt = now;
      next.history = [...current.history, ...history];
      tasks.set(id, next);
      return next;
    },

    remove(id) {
      return tasks.delete(id);
    },
  };
}
