import { buildApp } from './app.js';
import { loadEnvironment } from './config/env.js';
import { createDatabase } from './database/client.js';
import { DatabaseAuthRepository } from './modules/auth/database-auth.repository.js';
import { DatabaseOrderRepository } from './modules/orders/database-order.repository.js';
import { DatabaseRestaurantRepository } from './modules/restaurants/database-restaurant.repository.js';

const env = loadEnvironment();
const database = env.DATABASE_URL ? createDatabase(env.DATABASE_URL) : undefined;
const app = await buildApp(
  env,
  database
    ? {
        restaurants: new DatabaseRestaurantRepository(database.db),
        orders: new DatabaseOrderRepository(database.db),
        auth: new DatabaseAuthRepository(database.db),
        readiness: async () => database.ping().catch(() => false),
      }
    : {},
);
if (database) app.addHook('onClose', () => database.close());

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'Shutting down');
  await app.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
