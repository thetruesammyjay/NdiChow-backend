// Test suite for the NdiChow API server.
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { AppEnvironment } from '../src/config/env.js';

// Shared test environment used to build the app in each test.
const testEnv: AppEnvironment = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: 4000,
  LOG_LEVEL: 'silent',
  CORS_ORIGINS: '*',
  AUTH_SESSION_DAYS: 7,
};

// Helper that registers a test customer and returns their auth token.
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

  // Close the app after each test to release resources.
  afterEach(async () => app?.close());

  // Verifies the health endpoint reports the service as ok.
  it('reports service health', async () => {
    app = await buildApp(testEnv);
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe('ok');
  });

  // Verifies the restaurant list endpoint returns the two seeded restaurants.
  it('lists seeded restaurants', async () => {
    app = await buildApp(testEnv);
    const response = await app.inject({ method: 'GET', url: '/api/v1/restaurants' });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(2);
  });

  // Creates an order and then lists orders for that customer.
  it('creates and returns a customer order', async () => {
    app = await buildApp(testEnv);
    const token = await register(app, 'customer1@example.com');

    // Create a new order using the registered customer's token.
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

    // The order should be created successfully with the expected total.
    expect(created.statusCode).toBe(201);
    expect(created.json().data.total).toBe(10_500);

    // The customer's order list should contain exactly this order.
    const listed = await app.inject({
      method: 'GET',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listed.json().data).toHaveLength(1);
  });

  // Verifies that a note on an order item is preserved.
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

  // Ensures the server uses its own menu prices and makes retries with the same idempotency key return the original order.
  it('uses authoritative menu prices and makes retries idempotent', async () => {
    app = await buildApp(testEnv);
    const token = await register(app, 'customer3@example.com');

    // A request with deliberately fake pricing data to confirm the server ignores it.
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

    // Two identical requests should produce the same order id.
    const first = await app.inject(request);
    const second = await app.inject(request);

    // Reusing the same key with a different payload should conflict.
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

  // Unauthenticated requests to the orders endpoint should be rejected.
  it('rejects unauthenticated order access', async () => {
    app = await buildApp(testEnv);
    const response = await app.inject({ method: 'GET', url: '/api/v1/orders' });
    expect(response.statusCode).toBe(401);
  });

  // Logging out should invalidate the session token.
  it('logs out an authenticated customer and invalidates the session', async () => {
    app = await buildApp(testEnv);
    const token = await register(app, 'logout@example.com');

    const loggedOut = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { authorization: `Bearer ${token}` },
    });

    // After logout, the same token should no longer be accepted.
    const sessionCheck = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(loggedOut.statusCode).toBe(204);
    expect(sessionCheck.statusCode).toBe(401);
  });

  // Fastify's own client error status codes should be preserved by the error handler.
  it('preserves Fastify client-error status codes', async () => {
    app = await buildApp(testEnv);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'unexpected=value',
    });

    expect(response.statusCode).toBe(415);
    expect(response.json().error.code).toBe('FST_ERR_CTP_INVALID_MEDIA_TYPE');
  });
});
