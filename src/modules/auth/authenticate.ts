import type { FastifyRequest } from 'fastify';
import { HttpError } from '../../lib/http-error.js';
import type { Customer } from './auth.model.js';
import { hashSessionToken, type AuthRepository } from './auth.repository.js';

export async function authenticate(
  request: FastifyRequest,
  repository: AuthRepository,
): Promise<Customer> {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'A valid bearer session is required.');
  }
  const token = authorization.slice('Bearer '.length).trim();
  const customer = token ? await repository.findCustomerBySession(hashSessionToken(token)) : null;
  if (!customer) throw new HttpError(401, 'UNAUTHENTICATED', 'The session is invalid or expired.');
  return customer;
}
