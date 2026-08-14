import { and, desc, eq, inArray } from 'drizzle-orm';
import type { AppDatabase } from '../../database/client.js';
import { orderItems, orders, orderStatusEvents } from '../../database/schema.js';
import type { Order, OrderStatus } from './order.model.js';
import {
  IdempotencyConflictError,
  type CreateOrderRecord,
  type OrderRepository,
} from './order.repository.js';

export class DatabaseOrderRepository implements OrderRepository {
  constructor(private readonly db: AppDatabase) {}

  async create(input: CreateOrderRecord): Promise<Order> {
    const existing = await this.findIdempotentRow(input.customerId, input.idempotencyKey);
    if (existing) {
      if (existing.requestFingerprint !== input.requestFingerprint)
        throw new IdempotencyConflictError();
      return (await this.attachItems([existing]))[0]!;
    }
    const subtotal = input.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    try {
      const orderId = await this.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(orders)
          .values({
            customerId: input.customerId,
            restaurantId: input.restaurantId,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: input.requestFingerprint,
            deliveryAddress: input.deliveryAddress,
            subtotal,
            deliveryFee: input.deliveryFee,
            total: subtotal + input.deliveryFee,
          })
          .returning({ id: orders.id });
        if (!created) throw new Error('Order insert did not return a row.');
        await tx
          .insert(orderItems)
          .values(input.items.map((item) => ({ orderId: created.id, ...item })));
        await tx.insert(orderStatusEvents).values({ orderId: created.id, status: 'pending' });
        return created.id;
      });
      return (await this.findById(orderId))!;
    } catch (error) {
      const duplicate = await this.findIdempotentRow(input.customerId, input.idempotencyKey);
      if (duplicate) {
        if (duplicate.requestFingerprint !== input.requestFingerprint)
          throw new IdempotencyConflictError();
        return (await this.attachItems([duplicate]))[0]!;
      }
      throw error;
    }
  }

  async listForCustomer(customerId: string): Promise<Order[]> {
    const rows = await this.db
      .select()
      .from(orders)
      .where(eq(orders.customerId, customerId))
      .orderBy(desc(orders.createdAt));
    return this.attachItems(rows);
  }

  async findById(id: string): Promise<Order | null> {
    const [row] = await this.db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!row) return null;
    return (await this.attachItems([row]))[0] ?? null;
  }

  private async findIdempotentRow(customerId: string, key: string) {
    const [row] = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.customerId, customerId), eq(orders.idempotencyKey, key)))
      .limit(1);
    return row ?? null;
  }

  private async attachItems(rows: (typeof orders.$inferSelect)[]): Promise<Order[]> {
    if (rows.length === 0) return [];
    const items = await this.db
      .select()
      .from(orderItems)
      .where(
        inArray(
          orderItems.orderId,
          rows.map((row) => row.id),
        ),
      );
    return rows.map((row) => ({
      id: row.id,
      customerId: row.customerId,
      restaurantId: row.restaurantId,
      deliveryAddress: row.deliveryAddress,
      subtotal: row.subtotal,
      deliveryFee: row.deliveryFee,
      total: row.total,
      status: row.status as OrderStatus,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      items: items
        .filter((item) => item.orderId === row.id)
        .map((item) => ({
          menuItemId: item.menuItemId,
          name: item.name,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          ...(item.notes === null ? {} : { notes: item.notes }),
        })),
    }));
  }
}
