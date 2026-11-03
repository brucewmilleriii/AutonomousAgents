import { z } from 'zod';

export const TaskStatus = z.enum(['todo', 'in_progress', 'in_review', 'done', 'blocked']);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const CreateTaskInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(''),
  owner: z.string().trim().min(1).max(100).optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInput>;

export const UpdateTaskInput = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
    owner: z.string().trim().min(1).max(100).nullable().optional(),
    status: TaskStatus.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' });
export type UpdateTaskInput = z.infer<typeof UpdateTaskInput>;

export interface HistoryEntry {
  at: string;
  field: string;
  from: unknown;
  to: unknown;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  owner: string | null;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  history: HistoryEntry[];
}
