import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const authSessions = pgTable(
  'auth_sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('auth_sessions_customer_idx').on(table.customerId)],
);

export const restaurants = pgTable(
  'restaurants',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    description: text('description').notNull(),
    cuisine: text('cuisine').array().notNull(),
    imageUrl: text('image_url').notNull(),
    ratingTenths: integer('rating_tenths').notNull().default(0),
    ratingCount: integer('rating_count').notNull().default(0),
    deliveryFee: integer('delivery_fee').notNull(),
    minimumOrder: integer('minimum_order').notNull(),
    deliveryMinMinutes: integer('delivery_min_minutes').notNull(),
    deliveryMaxMinutes: integer('delivery_max_minutes').notNull(),
    isOpen: boolean('is_open').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('restaurants_rating_check', sql`${table.ratingTenths} between 0 and 50`),
    check('restaurants_fees_check', sql`${table.deliveryFee} >= 0 and ${table.minimumOrder} >= 0`),
    check(
      'restaurants_delivery_time_check',
      sql`${table.deliveryMinMinutes} >= 0 and ${table.deliveryMaxMinutes} >= ${table.deliveryMinMinutes}`,
    ),
  ],
);

export const menuCategories = pgTable(
  'menu_categories',
  {
    id: text('id').primaryKey(),
    restaurantId: text('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [index('menu_categories_restaurant_idx').on(table.restaurantId)],
);

export const menuItems = pgTable(
  'menu_items',
  {
    id: text('id').primaryKey(),
    categoryId: text('category_id')
      .notNull()
      .references(() => menuCategories.id, { onDelete: 'cascade' }),
    restaurantId: text('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    price: integer('price').notNull(),
    imageUrl: text('image_url').notNull(),
    isAvailable: boolean('is_available').notNull().default(true),
    preparationMinutes: integer('preparation_minutes').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [
    index('menu_items_restaurant_idx').on(table.restaurantId),
    check('menu_items_values_check', sql`${table.price} >= 0 and ${table.preparationMinutes} >= 0`),
  ],
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    restaurantId: text('restaurant_id')
      .notNull()
      .references(() => restaurants.id),
    idempotencyKey: text('idempotency_key').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    deliveryAddress: text('delivery_address').notNull(),
    subtotal: integer('subtotal').notNull(),
    deliveryFee: integer('delivery_fee').notNull(),
    total: integer('total').notNull(),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('orders_customer_idempotency_uidx').on(table.customerId, table.idempotencyKey),
    index('orders_customer_created_idx').on(table.customerId, table.createdAt),
    check(
      'orders_amounts_check',
      sql`${table.subtotal} >= 0 and ${table.deliveryFee} >= 0 and ${table.total} = ${table.subtotal} + ${table.deliveryFee}`,
    ),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    menuItemId: text('menu_item_id')
      .notNull()
      .references(() => menuItems.id),
    name: text('name').notNull(),
    unitPrice: integer('unit_price').notNull(),
    quantity: integer('quantity').notNull(),
    notes: text('notes'),
  },
  (table) => [
    index('order_items_order_idx').on(table.orderId),
    check('order_items_values_check', sql`${table.unitPrice} >= 0 and ${table.quantity} > 0`),
  ],
);

export const orderStatusEvents = pgTable(
  'order_status_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('order_status_events_order_idx').on(table.orderId)],
);
