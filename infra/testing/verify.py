#!/usr/bin/env python3
"""Live checks of isolated testing services. Never prints tokens or user content."""
import datetime
import json
import secrets
from pathlib import Path
import subprocess
import urllib.error
import urllib.request
import uuid

ROOT = Path('/opt/icao/testing')
API = 'http://172.30.244.10:3101'
CLOUD = 'http://172.30.244.11:8000'

def request(origin, path, *, headers=None, body=None, method=None, expected=200):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(origin + path, data=data, headers={'Content-Type':'application/json', **(headers or {})}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read()
    if status != expected:
        try:
            parsed = json.loads(raw)
            code = parsed.get('error_code') or parsed.get('code') or (parsed.get('error') or {}).get('code')
        except Exception:
            code = 'unclassified'
        raise RuntimeError(f'testing_http_failed:{path}:{status}:{code}')
    try:
        return json.loads(raw)
    except ValueError:
        return raw

def sql(container, database, statement):
    return subprocess.check_output(['docker','exec','-i',container,'psql','-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1','-At'],input=statement,text=True).strip()

def main():
    compose = json.loads((ROOT / 'compose.json').read_text())
    assert compose['name'] == 'icao-testing'
    assert compose['networks']['isolated']['internal'] is True
    assert set(compose['services']['api']['networks']) == {'isolated'}
    env = compose['services']['api']['environment']
    assert env['NODE_ENV'] == 'test' and env['SMS_PROVIDER'] == 'disabled'
    assert not any(key in env for key in ['APPLE_PRIVATE_KEY','APPLE_IAP_SERVER_PRIVATE_KEY','WECHAT_APP_SECRET','DEEPSEEK_API_KEY','TENCENT_CLOUD_SECRET_KEY','ALIYUN_SMS_ACCESS_KEY_SECRET'])
    assert env['DATABASE_URL'].endswith('@db:5432/icao_testing')
    credentials = json.loads((ROOT / 'credentials.json').read_text())
    anon = {'apikey': credentials['anonKey']}
    request(API, '/health/ready')
    request(CLOUD, '/auth/v1/health', headers=anon)
    assert sql('supabase-db','postgres',"SELECT count(*) FROM auth.users WHERE phone='8619900000001'") == '0'
    request(CLOUD, '/auth/v1/otp', headers=anon, body={'phone': credentials['testPhone'], 'create_user': True})
    session = request(CLOUD, '/auth/v1/verify', headers=anon,
                      body={'type':'sms','phone':credentials['testPhone'],'token':credentials['testOtp']})
    token = session['access_token']
    auth = {'Authorization':'Bearer ' + token}
    account = request(API,'/v1/account',headers=auth)['data']
    me = request(API,'/v1/me',headers=auth)['data']
    assert account['accountId'] == me['id'] and account['phoneBound']
    entitlements = request(API,'/v1/commerce/entitlements/current',headers=auth)['data']
    # Test an existing member from the restored snapshot, without changing the
    # production user or retaining a changed password in the testing copy.
    member_raw = sql('icao-testing-db','icao_testing',"""SELECT row_to_json(t) FROM (
      SELECT u.id,u.phone,u.encrypted_password,a.account_id
      FROM auth.users u JOIN public.account_identities a ON a.auth_user_id=u.id AND a.provider='phone'
      JOIN public.accounts account ON account.id=a.account_id AND account.status='active'
      WHERE EXISTS (SELECT 1 FROM public.membership_entitlement_segments m
        WHERE m.account_id=a.account_id AND m.environment='production' AND m.status='active'
          AND m.starts_at<=now() AND m.ends_at>now())
        AND NOT EXISTS (SELECT 1 FROM public.account_login_method_removals r WHERE r.auth_user_id=u.id)
      LIMIT 1) t;""")
    assert member_raw, 'restored_active_phone_member_missing'
    member=json.loads(member_raw)
    password=secrets.token_urlsafe(32)
    admin={'apikey':credentials['serviceKey'],'Authorization':'Bearer '+credentials['serviceKey']}
    try:
        request(CLOUD,'/auth/v1/admin/users/'+member['id'],headers=admin,method='PUT',body={'password':password})
        restored_session=request(CLOUD,'/auth/v1/token?grant_type=password',headers=anon,
                                 body={'phone':member['phone'],'password':password})
    finally:
        saved="'"+member['encrypted_password'].replace("'","''")+"'" if member['encrypted_password'] is not None else 'NULL'
        sql('icao-testing-db','icao_testing',"UPDATE auth.users SET encrypted_password="+saved+" WHERE id='"+str(uuid.UUID(member['id']))+"';")
    restored_auth={'Authorization':'Bearer '+restored_session['access_token']}
    restored_account=request(API,'/v1/account',headers=restored_auth)['data']
    assert restored_account['accountId']==member['account_id']
    restored_entitlement=request(API,'/v1/commerce/entitlements/current',headers=restored_auth)['data']
    assert restored_entitlement['production']['membership']['active'] is True
    request(API,'/v1/account',expected=401)
    # A testing session must be unusable on the live production API (read only).
    request('http://127.0.0.1:3101','/v1/account',headers=auth,expected=401)
    marker = 'version_management_probe_' + uuid.uuid4().hex
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
    mutation = {'mutationId': marker, 'kind':'document','payload':{
        'documentKey':marker, 'document':{'environment':'testing'},'version':1,'updatedAt':now}}
    record = {'mutationId': marker + '_record', 'kind':'learning_record','payload':{
        'recordId':marker, 'record':{'id':marker,'recordType':'session','createdAt':now},
        'occurredAt':now,'updatedAt':now,'version':1}}
    card = {'mutationId':marker + '_card', 'kind':'card_state','payload':{
        'bankId':'opi','topicId':'testing','cardId':marker,
        'state':{'visited':True,'completed':True,'note':'testing isolation probe','updatedAt':now},
        'updatedAt':now,'version':1}}
    result = request(API,'/v1/sync/push',headers=auth,body={'ownerUserId':me['id'],'mutations':[mutation,record,card]},expected=201)['data']
    assert all(item['status'] == 'accepted' for item in result['results'])
    pulled = request(API,'/v1/sync/pull?cursor=0',headers=auth)['data']
    assert any(change.get('payload',{}).get('documentKey') == marker for change in pulled['changes'])
    assert any(change.get('payload',{}).get('recordId') == marker for change in pulled['changes'])
    assert any(change.get('payload',{}).get('cardId') == marker for change in pulled['changes'])
    assert sql('supabase-db','postgres',"SELECT count(*) FROM public.learning_records WHERE client_record_id='" + marker + "'") == '0'
    assert sql('supabase-db','postgres',"SELECT count(*) FROM public.user_card_states WHERE card_id='" + marker + "'") == '0'
    assert sql('supabase-db','postgres',"SELECT count(*) FROM public.user_documents WHERE document_key='" + marker + "'") == '0'
    assert sql('supabase-db','postgres',"SELECT count(*) FROM auth.users WHERE phone='8619900000001'") == '0'
    request(CLOUD,'/storage/v1/object/public/app-releases/updates.json')
    bucket='testing-probe-'+uuid.uuid4().hex
    request(CLOUD,'/storage/v1/bucket',headers=admin,body={'id':bucket,'name':bucket,'public':False})
    try:
        request(CLOUD,'/storage/v1/object/'+bucket+'/probe.json',headers=admin,body={'environment':'testing'})
        signed=request(CLOUD,'/storage/v1/object/sign/'+bucket+'/probe.json',headers=admin,body={'expiresIn':60})
        assert request(CLOUD,'/storage/v1'+signed['signedURL'])=={'environment':'testing'}
        assert sql('supabase-db','postgres',"SELECT count(*) FROM storage.buckets WHERE id='"+bucket+"'")=='0'
    finally:
        request(CLOUD,'/storage/v1/object/'+bucket,headers=admin,method='DELETE',body={'prefixes':['probe.json']})
        request(CLOUD,'/storage/v1/bucket/'+bucket,headers=admin,method='DELETE')
    # No route from the testing API to outside services or production public ingress.
    result = subprocess.run(['docker','exec','icao-testing-api','node','-e',
        "fetch('https://api.readyoufife.com/health/ready',{signal:AbortSignal.timeout(3000)}).then(()=>process.exit(1)).catch(()=>process.exit(0))"])
    assert result.returncode == 0
    result = subprocess.run(['docker','exec','icao-testing-api','node','-e',
        "fetch('http://172.30.244.1:80',{redirect:'manual',signal:AbortSignal.timeout(3000)}).then(()=>process.exit(1)).catch(()=>process.exit(0))"])
    assert result.returncode == 0, 'testing_can_connect_to_host_gateway'
    baseline = json.loads((ROOT / 'baseline.json').read_text())
    for key,name in [('api','icao-api'),('db','supabase-db'),('auth','supabase-auth'),('storage','supabase-storage')]:
        live=json.loads(subprocess.check_output(['docker','inspect',name]))[0]
        assert live['Id'] == baseline[key]['containerId'] and live['State']['StartedAt'] == baseline[key]['startedAt']
        assert live['State']['Running']
    evidence = {'environment':'testing','verifiedAt':now,'checks':{
        'login':True,'accountIdentity':True,'entitlementRead':bool(entitlements),'restoredMemberIdentityAndEntitlement':True,'syncPushPull':True,'learningRecordAndCardState':True,
        'publicStorage':True,'privateStorageWriteSignedReadCleanup':True,'productionRejectsTestToken':True,'productionProbeRowsAbsent':True,
        'externalEgressBlocked':True,'hostGatewayConnectionsBlocked':True,'productionContainersUnchanged':True},
        'externalCapabilities':'disabled: paid AI, payments, external SMS and social login',
        'snapshot':json.loads((ROOT/'restore-complete.json').read_text())}
    (ROOT / 'verification.json').write_text(json.dumps(evidence,indent=2))
    print(json.dumps(evidence))

if __name__ == '__main__':
    main()
