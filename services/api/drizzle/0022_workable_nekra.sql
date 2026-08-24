ALTER TABLE "apple_credential_intakes" DROP CONSTRAINT "apple_credential_intakes_status_check";--> statement-breakpoint
ALTER TABLE "apple_credential_intakes" ADD CONSTRAINT "apple_credential_intakes_status_check" CHECK ("apple_credential_intakes"."status" IN ('pending_exchange', 'pending_validation', 'pending_binding', 'revoke_pending', 'retryable', 'revoked', 'manual_action_required'));--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_active_apple_intake_create()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.accounts account
    WHERE account.id = NEW.account_id AND account.status = 'active'
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'account_not_active' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER apple_credential_intakes_active_account_create
BEFORE INSERT ON public.apple_credential_intakes
FOR EACH ROW EXECUTE FUNCTION enforce_active_apple_intake_create();
