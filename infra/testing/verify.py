#!/usr/bin/env python3
"""Live checks of isolated testing services. Never prints tokens or user content."""
import datetime
import json
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
    return subprocess.check_output(['docker','exec',container,'psql','-U','supabase_admin','-d',database,'-Atc',statement],text=True).strip()

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
    # No route from the testing API to outside services or production public ingress.
    result = subprocess.run(['docker','exec','icao-testing-api','node','-e',
        "fetch('https://api.readyoufife.com/health/ready',{signal:AbortSignal.timeout(3000)}).then(()=>process.exit(1)).catch(()=>process.exit(0))"])
    assert result.returncode == 0
    baseline = json.loads((ROOT / 'baseline.json').read_text())
    for key,name in [('api','icao-api'),('db','supabase-db'),('auth','supabase-auth'),('storage','supabase-storage')]:
        live=json.loads(subprocess.check_output(['docker','inspect',name]))[0]
        assert live['Id'] == baseline[key]['containerId'] and live['State']['StartedAt'] == baseline[key]['startedAt']
        assert live['State']['Running']
    evidence = {'environment':'testing','verifiedAt':now,'checks':{
        'login':True,'accountIdentity':True,'entitlementRead':bool(entitlements),'syncPushPull':True,'learningRecordAndCardState':True,
        'publicStorage':True,'productionRejectsTestToken':True,'productionProbeRowsAbsent':True,
        'externalEgressBlocked':True,'productionContainersUnchanged':True},
        'externalCapabilities':'disabled: paid AI, payments, external SMS and social login',
        'snapshot':json.loads((ROOT/'restore-complete.json').read_text())}
    (ROOT / 'verification.json').write_text(json.dumps(evidence,indent=2))
    print(json.dumps(evidence))

if __name__ == '__main__':
    main()
