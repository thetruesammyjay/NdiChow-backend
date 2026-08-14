import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { AppEnvironment } from '../src/config/env.js';

const testEnv: AppEnvironment = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: 4000,
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: '*',
  AUTH_SESSION_DAYS: 7,
};

async function register(app: FastifyInstance, email: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, name: 'Test Customer', password: 'strong-password-123' },
  });
  expect(response.statusCode).toBe(201);
  return response.json().data.token as string;
}

describe('NdiChow API', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => app?.close());

  it('reports service health', async () => {
    app = await buildApp(testEnv);
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe('ok');
  });

  it('lists seeded restaurants', async () => {
    app = await buildApp(testEnv);
    const response = await app.inject({ method: 'GET', url: '/api/v1/restaurants' });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(2);
  });

  it('creates and returns a customer order', async () => {
    app = await buildApp(testEnv);
    const token = await register(app, 'customer1@example.com');
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'test-order-0001' },
      payload: {
        restaurantId: 'jollof-corner',
        deliveryAddress: '12 Adeola Odeku Street, Lagos',
        items: [{ menuItemId: 'party-jollof-chicken', quantity: 2 }],
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().data.total).toBe(10_500);

    const listed = await app.inject({
      method: 'GET',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listed.json().data).toHaveLength(1);
  });

  it('preserves an order item note when supplied', async () => {
    app = await buildApp(testEnv);
    const token = await register(app, 'customer2@example.com');
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'test-order-0002' },
      payload: {
        restaurantId: 'jollof-corner',
        deliveryAddress: '8 Bourdillon Road, Lagos',
        items: [
          {
            menuItemId: 'party-jollof-chicken',
            quantity: 1,
            notes: 'No plantain, please',
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data.items[0].notes).toBe('No plantain, please');
  });

  it('uses authoritative menu prices and makes retries idempotent', async () => {
    app = await buildApp(testEnv);
    const token = await register(app, 'customer3@example.com');
    const request = {
      method: 'POST' as const,
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'same-order-0001' },
      payload: {
        restaurantId: 'jollof-corner',
        deliveryAddress: '1 Marina Road, Lagos',
        deliveryFee: 1,
        items: [
          { menuItemId: 'party-jollof-chicken', quantity: 1, unitPrice: 1, name: 'Cheap fake' },
        ],
      },
    };
    const first = await app.inject(request);
    const second = await app.inject(request);
    const conflicting = await app.inject({
      ...request,
      payload: { ...request.payload, deliveryAddress: '2 Marina Road, Lagos' },
    });
    expect(first.statusCode).toBe(201);
    expect(second.json().data.id).toBe(first.json().data.id);
    expect(first.json().data.total).toBe(5700);
    expect(first.json().data.items[0].name).toBe('Party Jollof & Chicken');
    expect(conflicting.statusCode).toBe(409);
    expect(conflicting.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('rejects unauthenticated order access', async () => {
    app = await buildApp(testEnv);
    const response = await app.inject({ method: 'GET', url: '/api/v1/orders' });
    expect(response.statusCode).toBe(401);
  });
});
