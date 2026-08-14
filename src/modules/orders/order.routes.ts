import type { FastifyPluginAsync } from 'fastify';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import { parseInput } from '../../lib/validation.js';
import { authenticate } from '../auth/authenticate.js';
import type { AuthRepository } from '../auth/auth.repository.js';
import type { RestaurantRepository } from '../restaurants/restaurant.repository.js';
import { IdempotencyConflictError, type OrderRepository } from './order.repository.js';

const createOrderSchema = z.object({
  restaurantId: z.string().min(1),
  deliveryAddress: z.string().trim().min(5).max(500),
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        quantity: z.number().int().min(1).max(50),
        notes: z.string().trim().max(300).optional(),
      }),
    )
    .min(1)
    .max(50),
});

export function orderRoutes(
  repository: OrderRepository,
  restaurants: RestaurantRepository,
  auth: AuthRepository,
): FastifyPluginAsync {
  return async (app) => {
    app.get('/', async (request) => {
      const customer = await authenticate(request, auth);
      return { data: await repository.listForCustomer(customer.id) };
    });

    app.get('/:orderId', async (request) => {
      const customer = await authenticate(request, auth);
      const params = parseInput(z.object({ orderId: z.uuid() }), request.params);
      const order = await repository.findById(params.orderId);
      if (!order || order.customerId !== customer.id) {
        throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
      }
      return { data: order };
    });

    app.post('/', async (request, reply) => {
      const customer = await authenticate(request, auth);
      const idempotencyKey = request.headers['idempotency-key'];
      if (
        typeof idempotencyKey !== 'string' ||
        idempotencyKey.length < 8 ||
        idempotencyKey.length > 128
      ) {
        throw new HttpError(
          400,
          'INVALID_IDEMPOTENCY_KEY',
          'Idempotency-Key must be 8 to 128 characters.',
        );
      }
      const input = parseInput(createOrderSchema, request.body);
      const restaurant = await restaurants.findById(input.restaurantId);
      if (!restaurant) throw new HttpError(404, 'RESTAURANT_NOT_FOUND', 'Restaurant not found.');
      if (!restaurant.isOpen)
        throw new HttpError(409, 'RESTAURANT_CLOSED', 'This restaurant is currently closed.');

      const catalog = new Map(
        restaurant.menu.flatMap((category) => category.items).map((item) => [item.id, item]),
      );
      const items = input.items.map(({ menuItemId, quantity, notes }) => {
        const item = catalog.get(menuItemId);
        if (!item)
          throw new HttpError(
            400,
            'INVALID_MENU_ITEM',
            'An item does not belong to this restaurant.',
          );
        if (!item.isAvailable)
          throw new HttpError(409, 'MENU_ITEM_UNAVAILABLE', `${item.name} is unavailable.`);
        return {
          menuItemId: item.id,
          name: item.name,
          unitPrice: item.price,
          quantity,
          ...(notes === undefined ? {} : { notes }),
        };
      });
      const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      if (subtotal < restaurant.minimumOrder) {
        throw new HttpError(
          400,
          'MINIMUM_ORDER_NOT_MET',
          'The restaurant minimum order has not been met.',
          {
            minimumOrder: restaurant.minimumOrder,
            subtotal,
          },
        );
      }
      const requestFingerprint = createHash('sha256')
        .update(
          JSON.stringify({
            restaurantId: restaurant.id,
            deliveryAddress: input.deliveryAddress,
            items,
          }),
        )
        .digest('hex');
      let order;
      try {
        order = await repository.create({
          customerId: customer.id,
          restaurantId: restaurant.id,
          deliveryAddress: input.deliveryAddress,
          deliveryFee: restaurant.deliveryFee,
          idempotencyKey,
          requestFingerprint,
          items,
        });
      } catch (error) {
        if (error instanceof IdempotencyConflictError) {
          throw new HttpError(
            409,
            'IDEMPOTENCY_KEY_REUSED',
            'This idempotency key was already used for another order.',
          );
        }
        throw error;
      }
      return reply.code(201).send({ data: order });
    });
  };
}
