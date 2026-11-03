import Fastify, { type FastifyInstance } from 'fastify';
import { registerTaskRoutes } from './tasks/routes.js';
import { createMemoryStore, type TaskStore } from './tasks/store.js';

export interface AppOptions {
  store?: TaskStore;
  logger?: boolean;
}

export function buildApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  const store = options.store ?? createMemoryStore();

  app.get('/health', async () => ({ status: 'ok' }));
  registerTaskRoutes(app, store);

  return app;
}
