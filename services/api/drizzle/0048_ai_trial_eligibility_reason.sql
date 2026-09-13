-- Display-only persisted evidence. Existing eligibility grants/claims are unchanged.
ALTER TABLE "accounts" ADD COLUMN "ai_trial_eligibility_reason" text;
