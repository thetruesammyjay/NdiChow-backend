import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import { parseInput } from '../../lib/validation.js';
import { authenticate } from './authenticate.js';
import {
  EmailConflictError,
  hashSessionToken,
  issueSessionToken,
  type AuthRepository,
} from './auth.repository.js';
import { hashPassword, verifyPassword } from './password.js';

const credentialsSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z
    .string()
    .min(10)
    .max(128)
    .regex(/[A-Za-z]/)
    .regex(/[0-9]/),
});

const registerSchema = credentialsSchema.extend({ name: z.string().trim().min(2).max(100) });

export function authRoutes(repository: AuthRepository, sessionDays: number): FastifyPluginAsync {
  return async (app) => {
    app.post(
      '/register',
      { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
      async (request, reply) => {
        const input = parseInput(registerSchema, request.body);
        if (await repository.findCustomerByEmail(input.email)) {
          throw new HttpError(
            409,
            'EMAIL_ALREADY_REGISTERED',
            'An account already exists for this email.',
          );
        }
        let customer;
        try {
          customer = await repository.createCustomer({
            email: input.email,
            name: input.name,
            passwordHash: await hashPassword(input.password),
          });
        } catch (error) {
          if (error instanceof EmailConflictError) {
            throw new HttpError(
              409,
              'EMAIL_ALREADY_REGISTERED',
              'An account already exists for this email.',
            );
          }
          throw error;
        }
        const session = await createSession(repository, customer.id, sessionDays);
        return reply.code(201).send({ data: { customer, ...session } });
      },
    );

    app.post(
      '/login',
      { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
      async (request) => {
        const input = parseInput(credentialsSchema, request.body);
        const customer = await repository.findCustomerByEmail(input.email);
        if (!customer || !(await verifyPassword(input.password, customer.passwordHash))) {
          throw new HttpError(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');
        }
        const { passwordHash: _passwordHash, ...safeCustomer } = customer;
        return {
          data: {
            customer: safeCustomer,
            ...(await createSession(repository, customer.id, sessionDays)),
          },
        };
      },
    );

    app.get('/me', async (request) => ({ data: await authenticate(request, repository) }));

    app.post('/logout', async (request, reply) => {
      await authenticate(request, repository);
      const token = request.headers.authorization!.slice('Bearer '.length).trim();
      await repository.deleteSession(hashSessionToken(token));
      return reply.code(204).send();
    });
  };
}

async function createSession(repository: AuthRepository, customerId: string, sessionDays: number) {
  const token = issueSessionToken();
  const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);
  await repository.createSession(customerId, hashSessionToken(token), expiresAt);
  return { token, expiresAt: expiresAt.toISOString() };
}
