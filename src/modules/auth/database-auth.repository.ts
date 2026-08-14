import { and, eq, gt } from 'drizzle-orm';
import type { AppDatabase } from '../../database/client.js';
import { authSessions, customers } from '../../database/schema.js';
import type { CreateCustomerInput, Customer, CustomerWithPassword } from './auth.model.js';
import type { AuthRepository } from './auth.repository.js';
import { EmailConflictError } from './auth.repository.js';

export class DatabaseAuthRepository implements AuthRepository {
  constructor(private readonly db: AppDatabase) {}

  async createCustomer(input: CreateCustomerInput): Promise<Customer> {
    try {
      const [customer] = await this.db.insert(customers).values(input).returning();
      if (!customer) throw new Error('Customer insert did not return a row.');
      return toCustomer(customer);
    } catch (error) {
      if (isPostgresUniqueViolation(error)) throw new EmailConflictError();
      throw error;
    }
  }

  async findCustomerByEmail(email: string): Promise<CustomerWithPassword | null> {
    const [customer] = await this.db
      .select()
      .from(customers)
      .where(eq(customers.email, email))
      .limit(1);
    return customer ? { ...toCustomer(customer), passwordHash: customer.passwordHash } : null;
  }

  async createSession(customerId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.db.insert(authSessions).values({ customerId, tokenHash, expiresAt });
  }

  async findCustomerBySession(tokenHash: string): Promise<Customer | null> {
    const [row] = await this.db
      .select({ customer: customers })
      .from(authSessions)
      .innerJoin(customers, eq(customers.id, authSessions.customerId))
      .where(and(eq(authSessions.tokenHash, tokenHash), gt(authSessions.expiresAt, new Date())))
      .limit(1);
    return row ? toCustomer(row.customer) : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.db.delete(authSessions).where(eq(authSessions.tokenHash, tokenHash));
  }
}

function isPostgresUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function toCustomer(row: typeof customers.$inferSelect): Customer {
  return { id: row.id, email: row.email, name: row.name, createdAt: row.createdAt.toISOString() };
}
