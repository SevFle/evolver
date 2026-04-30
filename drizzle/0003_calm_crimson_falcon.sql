ALTER TABLE "endpoint_subscriptions" ALTER COLUMN "endpoint_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "endpoint_subscriptions" ADD COLUMN "endpoint_group_id" uuid;--> statement-breakpoint
ALTER TABLE "endpoint_subscriptions" ADD CONSTRAINT "endpoint_subscriptions_endpoint_group_id_endpoint_groups_id_fk" FOREIGN KEY ("endpoint_group_id") REFERENCES "public"."endpoint_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endpoint_subscriptions" ADD COLUMN "delivery_mode" text NOT NULL DEFAULT 'direct';--> statement-breakpoint
ALTER TABLE "endpoint_subscriptions" ADD CONSTRAINT "endpoint_subscriptions_delivery_mode_check" CHECK (
  CASE
    WHEN delivery_mode = 'direct' THEN endpoint_id IS NOT NULL
    WHEN delivery_mode = 'group' THEN endpoint_group_id IS NOT NULL
    WHEN delivery_mode = 'fanout' THEN endpoint_id IS NULL AND endpoint_group_id IS NULL
    ELSE false
  END
);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "delivery_mode" text;--> statement-breakpoint
UPDATE "events" SET "delivery_mode" = CASE
  WHEN endpoint_id IS NOT NULL THEN 'direct'
  WHEN endpoint_group_id IS NOT NULL THEN 'group'
  ELSE 'fanout'
END;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "delivery_mode" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "delivery_mode" SET DEFAULT 'direct';--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_delivery_mode_check" CHECK (
  CASE
    WHEN delivery_mode = 'direct' THEN endpoint_id IS NOT NULL
    WHEN delivery_mode = 'group' THEN endpoint_group_id IS NOT NULL
    WHEN delivery_mode = 'fanout' THEN endpoint_id IS NULL AND endpoint_group_id IS NULL
    ELSE false
  END
);--> statement-breakpoint
CREATE OR REPLACE FUNCTION "set_updated_at"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updated_at" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "endpoint_subscriptions_set_updated_at"
  BEFORE UPDATE ON "endpoint_subscriptions"
  FOR EACH ROW
  EXECUTE FUNCTION "set_updated_at"();
