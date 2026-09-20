/** Called inside the first publication transaction only, after an explicit
 * RESET_LEARNING_HISTORY request. Reuses the existing synchronization generation
 * contract; account identity, commercial ledgers and personal documents survive. */
export async function resetLearningHistoryForContent(tx) {
  const users = await tx`select id from accounts order by id`;
  for (const user of users) {
    await tx`select pg_advisory_xact_lock(hashtextextended(${'learning:' + user.id}, 0))`;
  }
  const ids = users.map((user) => user.id);
  if (!ids.length) return { accounts: 0, cardStates: 0, records: 0 };
  // Use the locked snapshot throughout. An account created concurrently was not
  // locked above and must not lose its first writes under generation zero.
  await tx`update accounts set learning_data_generation = learning_data_generation + 1,
    ai_result_generation = ai_result_generation + 1, updated_at = now() where id in ${tx(ids)}`;
  const cards = await tx`delete from user_card_states where user_id in ${tx(ids)} returning user_id`;
  const records = await tx`delete from learning_records where user_id in ${tx(ids)} returning id`;
  await tx`update ai_point_reservations set result_payload = null, result_deleted_at = now() where result_payload is not null and account_id in ${tx(ids)}`;
  await tx`delete from sync_mutations where user_id in ${tx(ids)}`;
  await tx`delete from sync_changes where user_id in ${tx(ids)}`;
  // Clients reset local learning payloads and cursor, then restore these retained
  // documents through the ordinary pull flow. No payment/entitlement tables change.
  await tx`insert into sync_changes (user_id, kind, entity_key, payload, version)
    select user_id, 'document', document_key,
      jsonb_build_object('documentKey', document_key, 'document', payload,
        'version', version, 'updatedAt', updated_at), version
    from user_documents where user_id in ${tx(ids)}`;
  return { accounts: users.length, cardStates: cards.length, records: records.length };
}
