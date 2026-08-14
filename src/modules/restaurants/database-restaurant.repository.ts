import { asc, count, eq, ilike, or } from 'drizzle-orm';
import type { AppDatabase } from '../../database/client.js';
import { menuCategories, menuItems, restaurants } from '../../database/schema.js';
import type { Restaurant, RestaurantSummary } from './restaurant.model.js';
import type { RestaurantRepository } from './restaurant.repository.js';

export class DatabaseRestaurantRepository implements RestaurantRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(
    query?: string,
    page = 1,
    limit = 20,
  ): Promise<{ items: RestaurantSummary[]; total: number }> {
    const filter = query?.trim()
      ? or(
          ilike(restaurants.name, `%${query.trim()}%`),
          ilike(restaurants.description, `%${query.trim()}%`),
        )
      : undefined;
    const rows = await this.db
      .select()
      .from(restaurants)
      .where(filter)
      .orderBy(asc(restaurants.name))
      .limit(limit)
      .offset((page - 1) * limit);
    const [totalRow] = await this.db.select({ value: count() }).from(restaurants).where(filter);
    return { items: rows.map(toSummary), total: totalRow?.value ?? 0 };
  }

  async findById(id: string): Promise<Restaurant | null> {
    const [restaurant] = await this.db
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, id))
      .limit(1);
    if (!restaurant) return null;
    const categories = await this.db
      .select()
      .from(menuCategories)
      .where(eq(menuCategories.restaurantId, id))
      .orderBy(asc(menuCategories.sortOrder));
    const items = await this.db
      .select()
      .from(menuItems)
      .where(eq(menuItems.restaurantId, id))
      .orderBy(asc(menuItems.sortOrder));
    return {
      ...toSummary(restaurant),
      menu: categories.map((category) => ({
        id: category.id,
        name: category.name,
        items: items
          .filter((item) => item.categoryId === category.id)
          .map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description,
            price: item.price,
            imageUrl: item.imageUrl,
            isAvailable: item.isAvailable,
            preparationMinutes: item.preparationMinutes,
          })),
      })),
    };
  }
}

function toSummary(row: typeof restaurants.$inferSelect): RestaurantSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    cuisine: row.cuisine,
    imageUrl: row.imageUrl,
    rating: row.ratingTenths / 10,
    ratingCount: row.ratingCount,
    deliveryFee: row.deliveryFee,
    minimumOrder: row.minimumOrder,
    estimatedDeliveryMinutes: { min: row.deliveryMinMinutes, max: row.deliveryMaxMinutes },
    isOpen: row.isOpen,
  };
}
