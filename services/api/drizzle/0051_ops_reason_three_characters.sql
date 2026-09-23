ALTER TABLE "ops_entitlement_adjustments" DROP CONSTRAINT "ops_entitlement_adjustments_reason_check";
--> statement-breakpoint
ALTER TABLE "ops_entitlement_adjustments" ADD CONSTRAINT "ops_entitlement_adjustments_reason_check" CHECK (length(btrim("reason")) BETWEEN 3 AND 500);
