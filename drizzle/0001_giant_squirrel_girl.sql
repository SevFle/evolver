CREATE TABLE "endpoint_group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "endpoint_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "events_idempotency_key_idx";--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "endpoint_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "is_replay" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "endpoint_group_id" uuid;--> statement-breakpoint
ALTER TABLE "endpoint_group_members" ADD CONSTRAINT "endpoint_group_members_group_id_endpoint_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."endpoint_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endpoint_group_members" ADD CONSTRAINT "endpoint_group_members_endpoint_id_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endpoint_groups" ADD CONSTRAINT "endpoint_groups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "endpoint_group_members_unique_idx" ON "endpoint_group_members" USING btree ("group_id","endpoint_id");--> statement-breakpoint
CREATE INDEX "endpoint_group_members_group_id_idx" ON "endpoint_group_members" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "endpoint_group_members_endpoint_id_idx" ON "endpoint_group_members" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "endpoint_groups_user_id_idx" ON "endpoint_groups" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_endpoint_group_id_endpoint_groups_id_fk" FOREIGN KEY ("endpoint_group_id") REFERENCES "public"."endpoint_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_replayed_from_event_id_events_id_fk" FOREIGN KEY ("replayed_from_event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_endpoint_group_id_idx" ON "events" USING btree ("endpoint_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "events_idempotency_key_idx" ON "events" USING btree ("user_id","idempotency_key") WHERE "events"."idempotency_key" is not null;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_target_check" CHECK ("events"."endpoint_id" is not null or "events"."endpoint_group_id" is not null);