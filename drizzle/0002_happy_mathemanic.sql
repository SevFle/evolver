CREATE TABLE "endpoint_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_target_check";--> statement-breakpoint
ALTER TABLE "endpoint_subscriptions" ADD CONSTRAINT "endpoint_subscriptions_endpoint_id_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endpoint_subscriptions" ADD CONSTRAINT "endpoint_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "endpoint_subscriptions_user_event_type_idx" ON "endpoint_subscriptions" USING btree ("user_id","event_type");--> statement-breakpoint
CREATE INDEX "endpoint_subscriptions_endpoint_id_idx" ON "endpoint_subscriptions" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "endpoint_subscriptions_active_user_idx" ON "endpoint_subscriptions" USING btree ("user_id","is_active") WHERE "endpoint_subscriptions"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "endpoint_subscriptions_endpoint_event_type_uniq" ON "endpoint_subscriptions" USING btree ("endpoint_id","event_type");