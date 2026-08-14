import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { CreateCustomerInput, Customer, CustomerWithPassword } from './auth.model.js';

export interface AuthRepository {
  createCustomer(input: CreateCustomerInput): Promise<Customer>;
  findCustomerByEmail(email: string): Promise<CustomerWithPassword | null>;
  createSession(customerId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  findCustomerBySession(tokenHash: string): Promise<Customer | null>;
  deleteSession(tokenHash: string): Promise<void>;
}

export class EmailConflictError extends Error {}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function issueSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export class InMemoryAuthRepository implements AuthRepository {
  private readonly customers = new Map<string, CustomerWithPassword>();
  private readonly sessions = new Map<string, { customerId: string; expiresAt: Date }>();

  async createCustomer(input: CreateCustomerInput): Promise<Customer> {
    if (await this.findCustomerByEmail(input.email)) throw new EmailConflictError();
    const customer: CustomerWithPassword = {
      id: randomUUID(),
      ...input,
      createdAt: new Date().toISOString(),
    };
    this.customers.set(customer.id, customer);
    return withoutPassword(customer);
  }

  async findCustomerByEmail(email: string): Promise<CustomerWithPassword | null> {
    return [...this.customers.values()].find((customer) => customer.email === email) ?? null;
  }

  async createSession(customerId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    this.sessions.set(tokenHash, { customerId, expiresAt });
  }

  async findCustomerBySession(tokenHash: string): Promise<Customer | null> {
    const session = this.sessions.get(tokenHash);
    if (!session || session.expiresAt <= new Date()) return null;
    const customer = this.customers.get(session.customerId);
    return customer ? withoutPassword(customer) : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }
}

function withoutPassword(customer: CustomerWithPassword): Customer {
  const { passwordHash: _passwordHash, ...safeCustomer } = customer;
  return safeCustomer;
}
