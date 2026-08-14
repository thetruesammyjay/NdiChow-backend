import 'dotenv/config';
import { createDatabase } from './client.js';
import { menuCategories, menuItems, restaurants } from './schema.js';
import { getMigrationUrl } from './database-url.js';

const url = getMigrationUrl();
const database = createDatabase(url);

try {
  await database.db
    .insert(restaurants)
    .values([
      {
        id: 'jollof-corner',
        name: 'Jollof Corner',
        slug: 'jollof-corner',
        description: 'Smoky party jollof, grilled proteins, and homestyle sides.',
        cuisine: ['Nigerian', 'Rice', 'Grill'],
        imageUrl: 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=1200',
        ratingTenths: 48,
        ratingCount: 324,
        deliveryFee: 900,
        minimumOrder: 2500,
        deliveryMinMinutes: 20,
        deliveryMaxMinutes: 30,
        isOpen: true,
      },
      {
        id: 'mamas-kitchen',
        name: "Mama's Kitchen",
        slug: 'mamas-kitchen',
        description: 'Comforting local soups, swallows, and Nigerian favourites.',
        cuisine: ['Nigerian', 'Soups', 'Swallow'],
        imageUrl: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=1200',
        ratingTenths: 47,
        ratingCount: 211,
        deliveryFee: 700,
        minimumOrder: 3000,
        deliveryMinMinutes: 30,
        deliveryMaxMinutes: 40,
        isOpen: true,
      },
    ])
    .onConflictDoNothing();

  await database.db
    .insert(menuCategories)
    .values([
      { id: 'popular', restaurantId: 'jollof-corner', name: 'Popular', sortOrder: 0 },
      { id: 'soups', restaurantId: 'mamas-kitchen', name: 'Soups & Swallows', sortOrder: 0 },
    ])
    .onConflictDoNothing();

  await database.db
    .insert(menuItems)
    .values([
      {
        id: 'party-jollof-chicken',
        categoryId: 'popular',
        restaurantId: 'jollof-corner',
        name: 'Party Jollof & Chicken',
        description: 'Smoky jollof rice with grilled chicken and fried plantain.',
        price: 4800,
        imageUrl: 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=800',
        isAvailable: true,
        preparationMinutes: 18,
        sortOrder: 0,
      },
      {
        id: 'jollof-beef',
        categoryId: 'popular',
        restaurantId: 'jollof-corner',
        name: 'Jollof & Peppered Beef',
        description: 'Party jollof served with tender peppered beef.',
        price: 5200,
        imageUrl: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=800',
        isAvailable: true,
        preparationMinutes: 20,
        sortOrder: 1,
      },
      {
        id: 'egusi-pounded-yam',
        categoryId: 'soups',
        restaurantId: 'mamas-kitchen',
        name: 'Egusi & Pounded Yam',
        description: 'Rich egusi soup with assorted meat and smooth pounded yam.',
        price: 5800,
        imageUrl: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=800',
        isAvailable: true,
        preparationMinutes: 22,
        sortOrder: 0,
      },
    ])
    .onConflictDoNothing();
  console.log('Database seed completed.');
} finally {
  await database.close();
}
