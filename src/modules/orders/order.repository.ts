import { randomUUID } from 'node:crypto';
import type { Order, OrderItem } from './order.model.js';

export interface CreateOrderRecord {
  customerId: string;
  restaurantId: string;
  items: OrderItem[];
  deliveryAddress: string;
  deliveryFee: number;
  idempotencyKey: string;
  requestFingerprint: string;
}

export class IdempotencyConflictError extends Error {}

export interface OrderRepository {
  create(input: CreateOrderRecord): Promise<Order>;
  listForCustomer(customerId: string): Promise<Order[]>;
  findById(id: string): Promise<Order | null>;
}

export class InMemoryOrderRepository implements OrderRepository {
  private readonly orders = new Map<string, Order>();
  private readonly idempotencyKeys = new Map<string, { orderId: string; fingerprint: string }>();

  async create(input: CreateOrderRecord): Promise<Order> {
    const existing = this.idempotencyKeys.get(`${input.customerId}:${input.idempotencyKey}`);
    if (existing) {
      if (existing.fingerprint !== input.requestFingerprint) throw new IdempotencyConflictError();
      return this.orders.get(existing.orderId)!;
    }
    const now = new Date().toISOString();
    const subtotal = input.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const order: Order = {
      id: randomUUID(),
      customerId: input.customerId,
      restaurantId: input.restaurantId,
      items: input.items,
      deliveryAddress: input.deliveryAddress,
      deliveryFee: input.deliveryFee,
      subtotal,
      total: subtotal + input.deliveryFee,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    this.orders.set(order.id, order);
    this.idempotencyKeys.set(`${input.customerId}:${input.idempotencyKey}`, {
      orderId: order.id,
      fingerprint: input.requestFingerprint,
    });
    return order;
  }

  async listForCustomer(customerId: string): Promise<Order[]> {
    return [...this.orders.values()]
      .filter((order) => order.customerId === customerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findById(id: string): Promise<Order | null> {
    return this.orders.get(id) ?? null;
  }
}
