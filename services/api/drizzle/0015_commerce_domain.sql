CREATE TABLE "ai_point_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment" text NOT NULL,
	"account_id" uuid NOT NULL,
	"original_account_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_reference" text NOT NULL,
	"source_order_id" uuid,
	"entitlement_segment_id" uuid,
	"rule_version" text NOT NULL,
	"ordinal" integer NOT NULL,
	"granted_points" integer NOT NULL,
	"consumed_points" integer DEFAULT 0 NOT NULL,
	"reserved_points" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_point_batches_identity" UNIQUE("id","environment","account_id"),
	CONSTRAINT "ai_point_batches_environment_check" CHECK ("ai_point_batches"."environment" IN ('sandbox', 'production')),
	CONSTRAINT "ai_point_batches_source_check" CHECK ("ai_point_batches"."source_type" IN ('trial', 'membership', 'compensation')),
	CONSTRAINT "ai_point_batches_status_check" CHECK ("ai_point_batches"."status" IN ('scheduled', 'available', 'expired', 'revoked', 'merged')),
	CONSTRAINT "ai_point_batches_grant_positive" CHECK ("ai_point_batches"."granted_points" >= 0),
	CONSTRAINT "ai_point_batches_consumed_nonnegative" CHECK ("ai_point_batches"."consumed_points" >= 0),
	CONSTRAINT "ai_point_batches_reserved_nonnegative" CHECK ("ai_point_batches"."reserved_points" >= 0),
	CONSTRAINT "ai_point_batches_total_within_grant" CHECK ("ai_point_batches"."consumed_points" + "ai_point_batches"."reserved_points" <= "ai_point_batches"."granted_points")
);
--> statement-breakpoint
ALTER TABLE "ai_point_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_point_ledger_entries" (
	"sequence" bigserial PRIMARY KEY NOT NULL,
	"environment" text NOT NULL,
	"account_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"reservation_id" uuid,
	"operation_id" text NOT NULL,
	"entry_type" text NOT NULL,
	"direction" text NOT NULL,
	"points" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_point_ledger_environment_check" CHECK ("ai_point_ledger_entries"."environment" IN ('sandbox', 'production')),
	CONSTRAINT "ai_point_ledger_entry_type_check" CHECK ("ai_point_ledger_entries"."entry_type" IN ('grant', 'reserve', 'settle', 'release', 'revoke', 'expire', 'restore', 'merge_debit', 'merge_credit')),
	CONSTRAINT "ai_point_ledger_direction_check" CHECK ("ai_point_ledger_entries"."direction" IN ('credit', 'debit', 'neutral')),
	CONSTRAINT "ai_point_ledger_entry_direction_pair_check" CHECK ((
    ("ai_point_ledger_entries"."entry_type" IN ('grant', 'release', 'restore', 'merge_credit') AND "ai_point_ledger_entries"."direction" = 'credit')
    OR ("ai_point_ledger_entries"."entry_type" IN ('reserve', 'revoke', 'expire', 'merge_debit') AND "ai_point_ledger_entries"."direction" = 'debit')
    OR ("ai_point_ledger_entries"."entry_type" = 'settle' AND "ai_point_ledger_entries"."direction" = 'neutral')
  )),
	CONSTRAINT "ai_point_ledger_points_nonnegative" CHECK ("ai_point_ledger_entries"."points" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ai_point_ledger_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_point_reservation_allocations" (
	"environment" text NOT NULL,
	"account_id" uuid NOT NULL,
	"reservation_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"points" integer NOT NULL,
	CONSTRAINT "ai_point_reservation_allocations_reservation_id_batch_id_pk" PRIMARY KEY("reservation_id","batch_id"),
	CONSTRAINT "ai_point_reservation_allocations_environment_check" CHECK ("ai_point_reservation_allocations"."environment" IN ('sandbox', 'production')),
	CONSTRAINT "ai_point_reservation_allocations_points_positive" CHECK ("ai_point_reservation_allocations"."points" > 0)
);
--> statement-breakpoint
ALTER TABLE "ai_point_reservation_allocations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_point_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment" text NOT NULL,
	"account_id" uuid NOT NULL,
	"operation_id" text NOT NULL,
	"capability" text NOT NULL,
	"rule_version" text NOT NULL,
	"points" integer NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	CONSTRAINT "ai_point_reservations_identity" UNIQUE("id","environment","account_id"),
	CONSTRAINT "ai_point_reservations_environment_check" CHECK ("ai_point_reservations"."environment" IN ('sandbox', 'production')),
	CONSTRAINT "ai_point_reservations_status_check" CHECK ("ai_point_reservations"."status" IN ('reserved', 'settled', 'released')),
	CONSTRAINT "ai_point_reservations_points_positive" CHECK ("ai_point_reservations"."points" > 0)
);
--> statement-breakpoint
ALTER TABLE "ai_point_reservations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "apple_notification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment" text NOT NULL,
	"notification_uuid" uuid NOT NULL,
	"notification_type" text NOT NULL,
	"subtype" text,
	"status" text DEFAULT 'received' NOT NULL,
	"signed_payload_hash" text NOT NULL,
	"decoded_payload" jsonb NOT NULL,
	"error_code" text,
	"signed_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "apple_notification_events_environment_check" CHECK ("apple_notification_events"."environment" IN ('sandbox', 'production')),
	CONSTRAINT "apple_notification_events_status_check" CHECK ("apple_notification_events"."status" IN ('received', 'processed', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "apple_notification_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "apple_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment" text NOT NULL,
	"transaction_id" text NOT NULL,
	"original_transaction_id" text NOT NULL,
	"order_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"app_account_token" uuid,
	"product_id" text NOT NULL,
	"bundle_id" text NOT NULL,
	"storefront" text,
	"currency" text,
	"price_milliunits" bigint,
	"purchase_date" timestamp with time zone NOT NULL,
	"signed_date" timestamp with time zone NOT NULL,
	"revocation_date" timestamp with time zone,
	"revocation_reason" integer,
	"signed_payload_hash" text NOT NULL,
	"decoded_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apple_transactions_environment_check" CHECK ("apple_transactions"."environment" IN ('sandbox', 'production'))
);
--> statement-breakpoint
ALTER TABLE "apple_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "commerce_channel_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"external_product_id" text NOT NULL,
	"product_key" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commerce_channel_products_channel_check" CHECK ("commerce_channel_products"."channel" IN ('apple_app_store', 'alipay', 'wechat_pay'))
);
--> statement-breakpoint
ALTER TABLE "commerce_channel_products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "commerce_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment" text NOT NULL,
	"channel" text NOT NULL,
	"external_order_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"original_account_id" uuid NOT NULL,
	"product_key" text NOT NULL,
	"external_product_id" text NOT NULL,
	"duration_days" integer NOT NULL,
	"ai_point_rule_version" text NOT NULL,
	"membership_grant_source" text NOT NULL,
	"membership_effective_at" timestamp with time zone NOT NULL,
	"membership_contribution_ms" bigint NOT NULL,
	"status" text DEFAULT 'verified' NOT NULL,
	"purchased_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revocation_cycle_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commerce_orders_identity" UNIQUE("id","environment","account_id"),
	CONSTRAINT "commerce_orders_environment_check" CHECK ("commerce_orders"."environment" IN ('sandbox', 'production')),
	CONSTRAINT "commerce_orders_channel_check" CHECK ("commerce_orders"."channel" IN ('apple_app_store', 'alipay', 'wechat_pay')),
	CONSTRAINT "commerce_orders_status_check" CHECK ("commerce_orders"."status" IN ('verified', 'refunded', 'revoked')),
	CONSTRAINT "commerce_orders_membership_source_check" CHECK ("commerce_orders"."membership_grant_source" IN ('purchase_discovery', 'refund_restore')),
	CONSTRAINT "commerce_orders_membership_contribution_nonnegative" CHECK ("commerce_orders"."membership_contribution_ms" >= 0),
	CONSTRAINT "commerce_orders_duration_positive" CHECK ("commerce_orders"."duration_days" > 0)
);
--> statement-breakpoint
ALTER TABLE "commerce_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "commerce_products" (
	"product_key" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"duration_days" integer NOT NULL,
	"base_price_cny_fen" integer NOT NULL,
	"ai_point_rule_version" text NOT NULL,
	"ai_point_batch_count" integer NOT NULL,
	"ai_point_batch_interval_days" integer NOT NULL,
	"ai_points_per_batch" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commerce_products_duration_positive" CHECK ("commerce_products"."duration_days" > 0),
	CONSTRAINT "commerce_products_price_positive" CHECK ("commerce_products"."base_price_cny_fen" > 0),
	CONSTRAINT "commerce_products_ai_batches_positive" CHECK ("commerce_products"."ai_point_batch_count" > 0),
	CONSTRAINT "commerce_products_ai_batch_interval_positive" CHECK ("commerce_products"."ai_point_batch_interval_days" > 0),
	CONSTRAINT "commerce_products_ai_points_positive" CHECK ("commerce_products"."ai_points_per_batch" > 0)
);
--> statement-breakpoint
ALTER TABLE "commerce_products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "membership_entitlement_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment" text NOT NULL,
	"account_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"superseded_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_segments_identity" UNIQUE("id","environment","account_id"),
	CONSTRAINT "membership_segments_environment_check" CHECK ("membership_entitlement_segments"."environment" IN ('sandbox', 'production')),
	CONSTRAINT "membership_segments_status_check" CHECK ("membership_entitlement_segments"."status" IN ('active', 'superseded', 'revoked')),
	CONSTRAINT "membership_segments_window_check" CHECK ("membership_entitlement_segments"."ends_at" > "membership_entitlement_segments"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "membership_entitlement_segments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_point_batches" ADD CONSTRAINT "ai_point_batches_order_environment_account_fk" FOREIGN KEY ("source_order_id","environment","account_id") REFERENCES "public"."commerce_orders"("id","environment","account_id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ai_point_batches" ADD CONSTRAINT "ai_point_batches_segment_environment_account_fk" FOREIGN KEY ("entitlement_segment_id","environment","account_id") REFERENCES "public"."membership_entitlement_segments"("id","environment","account_id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ai_point_ledger_entries" ADD CONSTRAINT "ai_point_ledger_batch_environment_account_fk" FOREIGN KEY ("batch_id","environment","account_id") REFERENCES "public"."ai_point_batches"("id","environment","account_id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ai_point_ledger_entries" ADD CONSTRAINT "ai_point_ledger_reservation_environment_account_fk" FOREIGN KEY ("reservation_id","environment","account_id") REFERENCES "public"."ai_point_reservations"("id","environment","account_id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ai_point_reservation_allocations" ADD CONSTRAINT "ai_point_allocations_reservation_environment_account_fk" FOREIGN KEY ("reservation_id","environment","account_id") REFERENCES "public"."ai_point_reservations"("id","environment","account_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ai_point_reservation_allocations" ADD CONSTRAINT "ai_point_allocations_batch_environment_account_fk" FOREIGN KEY ("batch_id","environment","account_id") REFERENCES "public"."ai_point_batches"("id","environment","account_id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "apple_transactions" ADD CONSTRAINT "apple_transactions_order_environment_account_fk" FOREIGN KEY ("order_id","environment","account_id") REFERENCES "public"."commerce_orders"("id","environment","account_id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "commerce_channel_products" ADD CONSTRAINT "commerce_channel_products_product_key_commerce_products_product_key_fk" FOREIGN KEY ("product_key") REFERENCES "public"."commerce_products"("product_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD CONSTRAINT "commerce_orders_product_key_commerce_products_product_key_fk" FOREIGN KEY ("product_key") REFERENCES "public"."commerce_products"("product_key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_entitlement_segments" ADD CONSTRAINT "membership_segments_order_environment_account_fk" FOREIGN KEY ("order_id","environment","account_id") REFERENCES "public"."commerce_orders"("id","environment","account_id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_point_batches_source_ordinal" ON "ai_point_batches" USING btree ("environment","source_type","source_reference","ordinal");--> statement-breakpoint
CREATE INDEX "ai_point_batches_account_expiry" ON "ai_point_batches" USING btree ("environment","account_id","expires_at");--> statement-breakpoint
CREATE INDEX "ai_point_batches_order" ON "ai_point_batches" USING btree ("source_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_point_ledger_idempotency" ON "ai_point_ledger_entries" USING btree ("environment","account_id","operation_id","entry_type","batch_id");--> statement-breakpoint
CREATE INDEX "ai_point_ledger_account_sequence" ON "ai_point_ledger_entries" USING btree ("environment","account_id","sequence");--> statement-breakpoint
CREATE INDEX "ai_point_ledger_reservation" ON "ai_point_ledger_entries" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "ai_point_reservation_allocations_batch" ON "ai_point_reservation_allocations" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_point_reservations_operation" ON "ai_point_reservations" USING btree ("environment","account_id","operation_id");--> statement-breakpoint
CREATE INDEX "ai_point_reservations_account_status" ON "ai_point_reservations" USING btree ("environment","account_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "apple_notification_events_environment_uuid" ON "apple_notification_events" USING btree ("environment","notification_uuid");--> statement-breakpoint
CREATE INDEX "apple_notification_events_status_received" ON "apple_notification_events" USING btree ("status","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "apple_transactions_environment_transaction" ON "apple_transactions" USING btree ("environment","transaction_id");--> statement-breakpoint
CREATE INDEX "apple_transactions_original" ON "apple_transactions" USING btree ("environment","original_transaction_id");--> statement-breakpoint
CREATE INDEX "apple_transactions_account_purchase" ON "apple_transactions" USING btree ("environment","account_id","purchase_date");--> statement-breakpoint
CREATE INDEX "apple_transactions_order" ON "apple_transactions" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_channel_products_external" ON "commerce_channel_products" USING btree ("channel","external_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_channel_products_internal" ON "commerce_channel_products" USING btree ("channel","product_key");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_orders_external" ON "commerce_orders" USING btree ("environment","channel","external_order_id");--> statement-breakpoint
CREATE INDEX "commerce_orders_account_purchased" ON "commerce_orders" USING btree ("environment","account_id","purchased_at");--> statement-breakpoint
CREATE INDEX "commerce_orders_product" ON "commerce_orders" USING btree ("product_key");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_segments_order_revision" ON "membership_entitlement_segments" USING btree ("environment","order_id","revision");--> statement-breakpoint
CREATE INDEX "membership_segments_account_window" ON "membership_entitlement_segments" USING btree ("environment","account_id","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "membership_segments_active" ON "membership_entitlement_segments" USING btree ("environment","account_id","status");--> statement-breakpoint
INSERT INTO "commerce_products" (
	"product_key", "display_name", "duration_days", "base_price_cny_fen",
	"ai_point_rule_version", "ai_point_batch_count", "ai_point_batch_interval_days", "ai_points_per_batch"
) VALUES
	('membership_7d_v1', '7天会员', 7, 6800, 'ai-points-v1', 1, 31, 250),
	('membership_15d_v1', '15天会员', 15, 10800, 'ai-points-v1', 1, 31, 500),
	('membership_31d_v1', '31天会员', 31, 16800, 'ai-points-v1', 1, 31, 1000),
	('membership_62d_v1', '62天会员', 62, 29800, 'ai-points-v1', 2, 31, 1000),
	('membership_93d_v1', '93天会员', 93, 39800, 'ai-points-v1', 3, 31, 1000);--> statement-breakpoint
INSERT INTO "commerce_channel_products" (
	"channel", "external_product_id", "product_key"
) VALUES
	('apple_app_store', 'com.readyoufife.ios.membership.7d.v1', 'membership_7d_v1'),
	('apple_app_store', 'com.readyoufife.ios.membership.15d.v1', 'membership_15d_v1'),
	('apple_app_store', 'com.readyoufife.ios.membership.31d.v1', 'membership_31d_v1'),
	('apple_app_store', 'com.readyoufife.ios.membership.62d.v1', 'membership_62d_v1'),
	('apple_app_store', 'com.readyoufife.ios.membership.93d.v1', 'membership_93d_v1');--> statement-breakpoint
CREATE FUNCTION "commerce_assert_reservation_allocation_total"(target_reservation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE expected_points integer; actual_points bigint;
BEGIN
	SELECT "points" INTO expected_points FROM "ai_point_reservations" WHERE "id" = target_reservation_id;
	IF NOT FOUND THEN RETURN; END IF;
	SELECT COALESCE(SUM("points"), 0) INTO actual_points FROM "ai_point_reservation_allocations"
	WHERE "reservation_id" = target_reservation_id;
	IF actual_points <> expected_points THEN
		RAISE EXCEPTION 'commerce_reservation_allocation_total_mismatch:%:expected=%:actual=%',
			target_reservation_id, expected_points, actual_points USING ERRCODE = '23514';
	END IF;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "commerce_assert_batch_totals"(target_batch_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
	recorded_reserved integer;
	recorded_consumed integer;
	granted integer;
	batch_source_type text;
	batch_source_reference text;
	reserved_allocations bigint;
	settled_allocations bigint;
	merge_credit_count bigint;
	merge_credit_points bigint;
	carried_consumption bigint := 0;
BEGIN
	SELECT "reserved_points", "consumed_points", "granted_points", "source_type", "source_reference"
	INTO recorded_reserved, recorded_consumed, granted, batch_source_type, batch_source_reference
	FROM "ai_point_batches" WHERE "id" = target_batch_id;
	IF NOT FOUND THEN RETURN; END IF;
	-- Settled and released reservations keep immutable allocations for audit,
	-- but only currently reserved rows contribute to batch.reserved_points and
	-- only settled rows contribute to batch.consumed_points.
	SELECT
		COALESCE(SUM(allocation."points") FILTER (WHERE reservation."status" = 'reserved'), 0),
		COALESCE(SUM(allocation."points") FILTER (WHERE reservation."status" = 'settled'), 0)
	INTO reserved_allocations, settled_allocations
	FROM "ai_point_reservation_allocations" allocation
	JOIN "ai_point_reservations" reservation ON reservation."id" = allocation."reservation_id"
	WHERE allocation."batch_id" = target_batch_id;

	SELECT COUNT(*), COALESCE(SUM("points"), 0)
	INTO merge_credit_count, merge_credit_points
	FROM "ai_point_ledger_entries"
	WHERE "batch_id" = target_batch_id AND "entry_type" = 'merge_credit';
	IF batch_source_type = 'trial' AND batch_source_reference LIKE 'merge:%' THEN
		IF merge_credit_count <> 1 OR merge_credit_points > granted THEN
			RAISE EXCEPTION 'commerce_merged_trial_credit_invalid:%:count=%:points=%:grant=%',
				target_batch_id, merge_credit_count, merge_credit_points, granted USING ERRCODE = '23514';
		END IF;
		-- A merged trial carries prior settled usage without fabricating a new
		-- reservation. Its single merge_credit records the remaining balance.
		carried_consumption := granted - merge_credit_points;
	ELSIF merge_credit_count <> 0 THEN
		RAISE EXCEPTION 'commerce_merge_credit_source_mismatch:%', target_batch_id USING ERRCODE = '23514';
	END IF;

	IF reserved_allocations <> recorded_reserved THEN
		RAISE EXCEPTION 'commerce_batch_reserved_total_mismatch:%:expected=%:actual=%',
			target_batch_id, reserved_allocations, recorded_reserved USING ERRCODE = '23514';
	END IF;
	IF settled_allocations + carried_consumption <> recorded_consumed THEN
		RAISE EXCEPTION 'commerce_batch_consumed_total_mismatch:%:expected=%:actual=%',
			target_batch_id, settled_allocations + carried_consumption, recorded_consumed USING ERRCODE = '23514';
	END IF;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "commerce_assert_reservation_batch_totals"(target_reservation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE target_batch_id uuid;
BEGIN
	FOR target_batch_id IN SELECT DISTINCT "batch_id" FROM "ai_point_reservation_allocations"
		WHERE "reservation_id" = target_reservation_id
	LOOP PERFORM "commerce_assert_batch_totals"(target_batch_id); END LOOP;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "commerce_assert_reservation_state"(target_reservation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
	reservation_status text;
	created timestamp with time zone;
	settled timestamp with time zone;
	released timestamp with time zone;
BEGIN
	SELECT "status", "created_at", "settled_at", "released_at"
	INTO reservation_status, created, settled, released
	FROM "ai_point_reservations" WHERE "id" = target_reservation_id;
	IF NOT FOUND THEN RETURN; END IF;
	IF reservation_status = 'reserved' AND (settled IS NOT NULL OR released IS NOT NULL) THEN
		RAISE EXCEPTION 'commerce_reservation_reserved_timestamp_invalid:%', target_reservation_id USING ERRCODE = '23514';
	ELSIF reservation_status = 'settled' AND (settled IS NULL OR released IS NOT NULL OR settled < created) THEN
		RAISE EXCEPTION 'commerce_reservation_settled_timestamp_invalid:%', target_reservation_id USING ERRCODE = '23514';
	ELSIF reservation_status = 'released' AND (released IS NULL OR settled IS NOT NULL OR released < created) THEN
		RAISE EXCEPTION 'commerce_reservation_released_timestamp_invalid:%', target_reservation_id USING ERRCODE = '23514';
	END IF;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "commerce_guard_reservation_transition"()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		IF NEW."status" <> 'reserved' THEN
			RAISE EXCEPTION 'commerce_reservation_must_start_reserved:%', NEW."id" USING ERRCODE = '23514';
		END IF;
		RETURN NEW;
	END IF;
	IF OLD."status" <> NEW."status" AND NOT (
		OLD."status" = 'reserved' AND NEW."status" IN ('settled', 'released')
	) THEN
		RAISE EXCEPTION 'commerce_reservation_transition_invalid:%:%->%',
			OLD."id", OLD."status", NEW."status" USING ERRCODE = '23514';
	END IF;
	IF OLD."status" IN ('settled', 'released') AND (
		OLD."settled_at" IS DISTINCT FROM NEW."settled_at"
		OR OLD."released_at" IS DISTINCT FROM NEW."released_at"
	) THEN
		RAISE EXCEPTION 'commerce_reservation_terminal_timestamp_immutable:%', OLD."id" USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "commerce_check_allocation_reservation_total"()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
	IF TG_OP <> 'INSERT' THEN PERFORM "commerce_assert_reservation_allocation_total"(OLD."reservation_id"); END IF;
	IF TG_OP <> 'DELETE' THEN PERFORM "commerce_assert_reservation_allocation_total"(NEW."reservation_id"); END IF;
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "commerce_check_reservation_allocation_total"()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
	IF TG_OP <> 'INSERT' THEN PERFORM "commerce_assert_reservation_allocation_total"(OLD."id"); END IF;
	IF TG_OP <> 'DELETE' THEN PERFORM "commerce_assert_reservation_allocation_total"(NEW."id"); END IF;
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "commerce_check_allocation_batch_total"()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
	IF TG_OP <> 'INSERT' THEN PERFORM "commerce_assert_batch_totals"(OLD."batch_id"); END IF;
	IF TG_OP <> 'DELETE' THEN PERFORM "commerce_assert_batch_totals"(NEW."batch_id"); END IF;
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "commerce_check_batch_totals"()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
	IF TG_OP <> 'INSERT' THEN PERFORM "commerce_assert_batch_totals"(OLD."id"); END IF;
	IF TG_OP <> 'DELETE' THEN PERFORM "commerce_assert_batch_totals"(NEW."id"); END IF;
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "commerce_check_ledger_batch_totals"()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
	IF TG_OP <> 'INSERT' THEN PERFORM "commerce_assert_batch_totals"(OLD."batch_id"); END IF;
	IF TG_OP <> 'DELETE' THEN PERFORM "commerce_assert_batch_totals"(NEW."batch_id"); END IF;
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "commerce_check_reservation_batch_totals"()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
	IF TG_OP <> 'INSERT' THEN PERFORM "commerce_assert_reservation_batch_totals"(OLD."id"); END IF;
	IF TG_OP <> 'DELETE' THEN PERFORM "commerce_assert_reservation_batch_totals"(NEW."id"); END IF;
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "commerce_check_reservation_state"()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
	IF TG_OP <> 'INSERT' THEN PERFORM "commerce_assert_reservation_state"(OLD."id"); END IF;
	IF TG_OP <> 'DELETE' THEN PERFORM "commerce_assert_reservation_state"(NEW."id"); END IF;
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "ai_point_reservations_transition_guard"
BEFORE INSERT OR UPDATE ON "ai_point_reservations"
FOR EACH ROW EXECUTE FUNCTION "commerce_guard_reservation_transition"();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ai_point_allocations_reservation_total_deferred"
AFTER INSERT OR UPDATE OR DELETE ON "ai_point_reservation_allocations"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "commerce_check_allocation_reservation_total"();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ai_point_reservations_allocation_total_deferred"
AFTER INSERT OR UPDATE OR DELETE ON "ai_point_reservations"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "commerce_check_reservation_allocation_total"();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ai_point_allocations_batch_total_deferred"
AFTER INSERT OR UPDATE OR DELETE ON "ai_point_reservation_allocations"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "commerce_check_allocation_batch_total"();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ai_point_batches_totals_deferred"
AFTER INSERT OR UPDATE OR DELETE ON "ai_point_batches"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "commerce_check_batch_totals"();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ai_point_reservations_batch_total_deferred"
AFTER INSERT OR UPDATE OR DELETE ON "ai_point_reservations"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "commerce_check_reservation_batch_totals"();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ai_point_ledger_batch_totals_deferred"
AFTER INSERT OR UPDATE OR DELETE ON "ai_point_ledger_entries"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "commerce_check_ledger_batch_totals"();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ai_point_reservations_state_deferred"
AFTER INSERT OR UPDATE OR DELETE ON "ai_point_reservations"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION "commerce_check_reservation_state"();--> statement-breakpoint
REVOKE ALL ON FUNCTION "commerce_assert_reservation_allocation_total"(uuid) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION "commerce_assert_batch_totals"(uuid) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION "commerce_assert_reservation_batch_totals"(uuid) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION "commerce_assert_reservation_state"(uuid) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION "commerce_guard_reservation_transition"() FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION "commerce_check_allocation_reservation_total"() FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION "commerce_check_reservation_allocation_total"() FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION "commerce_check_allocation_batch_total"() FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION "commerce_check_batch_totals"() FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION "commerce_check_ledger_batch_totals"() FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION "commerce_check_reservation_batch_totals"() FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION "commerce_check_reservation_state"() FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "commerce_products" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "commerce_channel_products" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "commerce_orders" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "apple_transactions" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "apple_notification_events" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "membership_entitlement_segments" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "ai_point_batches" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "ai_point_reservations" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "ai_point_reservation_allocations" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON TABLE "ai_point_ledger_entries" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "ai_point_ledger_entries_sequence_seq" FROM anon, authenticated;
