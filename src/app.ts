import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import type { AppEnvironment } from './config/env.js';
import { HttpError } from './lib/http-error.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { InMemoryAuthRepository, type AuthRepository } from './modules/auth/auth.repository.js';
import {
  InMemoryOrderRepository,
  type OrderRepository,
} from './modules/orders/order.repository.js';
import { orderRoutes } from './modules/orders/order.routes.js';
import {
  InMemoryRestaurantRepository,
  type RestaurantRepository,
} from './modules/restaurants/restaurant.repository.js';
import { restaurantRoutes } from './modules/restaurants/restaurant.routes.js';

export interface AppDependencies {
  restaurants?: RestaurantRepository;
  orders?: OrderRepository;
  auth?: AuthRepository;
  readiness?: () => Promise<boolean>;
}

export async function buildApp(
  env: AppEnvironment,
  dependencies: AppDependencies = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : { level: env.LOG_LEVEL },
    logController: new LogController({
      disableRequestLogging: env.NODE_ENV === 'test',
    }),
    bodyLimit: 256 * 1024,
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(helmet);
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(cors, {
    origin:
      env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',').map((value) => value.trim()),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: false,
  });

  app.get('/health', async () => ({
    data: {
      service: 'ndichow-backend',
      status: 'ok',
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
    },
  }));

  app.get('/ready', async (_request, reply) => {
    const ready = dependencies.readiness ? await dependencies.readiness() : true;
    return reply
      .code(ready ? 200 : 503)
      .send({ data: { status: ready ? 'ready' : 'unavailable' } });
  });

  app.setNotFoundHandler((_request, reply) => {
    void reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      const code = 'code' in error && typeof error.code === 'string' ? error.code : 'BAD_REQUEST';
      const message =
        'message' in error && typeof error.message === 'string'
          ? error.message
          : 'The request could not be processed.';
      return reply.code(error.statusCode).send({
        error: { code, message },
      });
    }
    app.log.error(error);
    return reply.code(500).send({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' },
    });
  });

  const restaurants = dependencies.restaurants ?? new InMemoryRestaurantRepository();
  const orders = dependencies.orders ?? new InMemoryOrderRepository();
  const auth = dependencies.auth ?? new InMemoryAuthRepository();
  await app.register(authRoutes(auth, env.AUTH_SESSION_DAYS), { prefix: '/api/v1/auth' });
  await app.register(restaurantRoutes(restaurants), { prefix: '/api/v1/restaurants' });
  await app.register(orderRoutes(orders, restaurants, auth), { prefix: '/api/v1/orders' });

  return app;
}
