#!/usr/bin/env python3
"""Rekey restored identities inside testing only; never reads production secrets."""
import hashlib
import hmac
import json
from pathlib import Path
import subprocess

ROOT = Path('/opt/icao/testing')

def query(statement):
    return subprocess.check_output(['docker','exec','-i','icao-testing-db','psql','-U','supabase_admin','-d','icao_testing','-v','ON_ERROR_STOP=1','-At'],input=statement,text=True).strip()

def main():
    compose=json.loads((ROOT/'compose.json').read_text())
    assert compose['name']=='icao-testing'
    env=compose['services']['api']['environment']
    assert env['DATABASE_URL'].endswith('@db:5432/icao_testing') and env['ICAO_DATA_ENVIRONMENT']=='testing'
    secret=env['ACCOUNT_IDENTITY_HASH_SECRET'].encode()
    rows=json.loads(query("""SELECT coalesce(json_agg(row_to_json(t)),'[]'::json) FROM (
      SELECT a.id,a.account_id,a.provider,
        CASE WHEN a.provider='phone' THEN '+' || ltrim(u.phone,'+')
             WHEN a.provider='wechat' THEN u.raw_app_meta_data->>'icao_wechat_subject'
             ELSE i.identity_data->>'sub' END AS subject
      FROM public.account_identities a JOIN auth.users u ON u.id=a.auth_user_id
      LEFT JOIN auth.identities i ON i.user_id=u.id AND i.provider=a.provider
    ) t;"""))
    def literal(value):
        return "'" + str(value).replace("'","''") + "'"
    benefit_secret=env.get('IDENTITY_BENEFIT_DIGEST_SECRET', env['ACCOUNT_IDENTITY_HASH_SECRET']).encode()
    def digest(value, key=secret):
        return hmac.new(key,value.encode(),hashlib.sha256).hexdigest()
    statements=['BEGIN;']
    changed=0
    for row in rows:
        if not row['subject']:
            continue
        domain=row['provider']+'\0'+row['subject']
        identity=digest('account-identity-v1\0'+domain)
        claim=digest('lifetime-benefit-v1\0'+domain, benefit_secret)
        context=digest('lifetime-benefit-account-context-v1\0'+row['account_id'], benefit_secret)
        statements.append('UPDATE public.account_identities SET subject_hash='+literal(identity)+' WHERE id='+literal(row['id'])+';')
        # Restored resolved identities already consumed their lifetime eligibility.
        # Preserve that fact under the new digest key rather than granting again.
        statements.append("INSERT INTO public.lifetime_identity_benefit_claims (benefit_key,identity_digest,provider,claim_context_digest,digest_key_version,claimed_at) VALUES ('free-trial-100-v1',"+','.join([literal(claim),literal(row['provider']),literal(context)])+",1,now()) ON CONFLICT DO NOTHING;")
        changed+=1
    statements.append('COMMIT;')
    query('\n'.join(statements))
    evidence={'environment':'testing','identitiesRekeyed':changed,'identitiesWithoutRestoredSubject':len(rows)-changed}
    (ROOT/'identity-rekey.json').write_text(json.dumps(evidence,indent=2))
    print(json.dumps(evidence))

if __name__=='__main__':
    main()
