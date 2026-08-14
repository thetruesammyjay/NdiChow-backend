ALTER TABLE "orders" ADD COLUMN "request_fingerprint" text;--> statement-breakpoint
UPDATE "orders" SET "request_fingerprint" = 'legacy:' || "id"::text WHERE "request_fingerprint" IS NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "request_fingerprint" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_values_check" CHECK ("menu_items"."price" >= 0 and "menu_items"."preparation_minutes" >= 0);--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_values_check" CHECK ("order_items"."unit_price" >= 0 and "order_items"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_check" CHECK ("orders"."subtotal" >= 0 and "orders"."delivery_fee" >= 0 and "orders"."total" = "orders"."subtotal" + "orders"."delivery_fee");--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_rating_check" CHECK ("restaurants"."rating_tenths" between 0 and 50);--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_fees_check" CHECK ("restaurants"."delivery_fee" >= 0 and "restaurants"."minimum_order" >= 0);--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_delivery_time_check" CHECK ("restaurants"."delivery_min_minutes" >= 0 and "restaurants"."delivery_max_minutes" >= "restaurants"."delivery_min_minutes");
