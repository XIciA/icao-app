#!/usr/bin/env python3
"""Reuse reviewed provider settings in the independent test deployment.
Run once after deploying code supporting production runtime + testing data.
Never copies database, session, encryption or content-signing keys.
"""
import base64
import fcntl
import ipaddress
import json
import os
from pathlib import Path
import secrets
import subprocess
import time

ROOT = Path('/opt/icao/testing')

def inspect(name):
    return json.loads(subprocess.check_output(['docker', 'inspect', name]))[0]

def env(name):
    return dict(item.split('=', 1) for item in inspect(name)['Config']['Env'])

def sql(statement):
    return subprocess.check_output(['docker', 'exec', '-i', 'icao-testing-db', 'psql', '-U', 'supabase_admin',
                                    '-d', 'icao_testing', '-At', '-v', 'ON_ERROR_STOP=1'], input=statement, text=True).strip()

def main():
    os.umask(0o077)
    lock = open('/run/lock/icao-testing-deploy.lock', 'w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    assert not (ROOT / 'full-runtime.json').exists(), 'full_runtime_already_enabled_do_not_reset_test_orders'
    compose_path = ROOT / 'compose.json'
    compose = json.loads(compose_path.read_text())
    assert compose['name'] == 'icao-testing'
    target = compose['services']['api']['environment']
    assert target['ICAO_DATA_ENVIRONMENT'] == 'testing'
    assert target['DATABASE_URL'].endswith('@db:5432/icao_testing')
    assert inspect('icao-testing-db')['Config']['Labels']['com.docker.compose.project'] == 'icao-testing'
    assert sql("SELECT count(*) FROM account_deletion_jobs WHERE status <> 'completed'") == '0', 'resolve_copied_deletion_jobs_first'
    assert sql('SELECT count(*) FROM account_login_method_removals') == '0', 'resolve_copied_removal_jobs_first'
    subnet = ipaddress.ip_network('172.30.245.0/24')
    for nid in subprocess.check_output(['docker','network','ls','-q'],text=True).split():
        network = json.loads(subprocess.check_output(['docker','network','inspect',nid]))[0]
        for item in network.get('IPAM',{}).get('Config') or []:
            if item.get('Subnet') and ipaddress.ip_network(item['Subnet']).version == 4:
                assert not subnet.overlaps(ipaddress.ip_network(item['Subnet'])), 'egress_subnet_conflict'
    backup = ROOT / ('before-full-runtime-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()))
    backup.mkdir(mode=0o700)
    (backup / 'compose.json').write_text(compose_path.read_text())
    tables = ['apple_revocable_credentials','apple_credential_intakes','apple_notification_events',
              'wechat_payment_attempts','sms_delivery_attempts','phone_otp_intents','wechat_auth_challenges']
    args = ['docker','exec','icao-testing-db','pg_dump','-U','supabase_admin','-d','icao_testing','-Fc','--data-only']
    for table in [*tables, 'account_identities', 'lifetime_identity_benefit_claims']: args.extend(['-t','public.'+table])
    with (backup / 'external-state.dump').open('wb') as output:
        subprocess.run(args, stdout=output, check=True)
    # A copied payment attempt must never close/refund a real historical order.
    # Keep accounts, memberships, learning and immutable commerce history.
    sql('BEGIN;\n' + '\n'.join('DELETE FROM public.' + table + ';' for table in tables) + '\nCOMMIT;')
    production = env('icao-api')
    prefixes = ('AI_', 'DEEPSEEK_', 'TENCENT_', 'SMS_', 'ALIYUN_SMS_', 'WECHAT_', 'APPLE_IAP_')
    names = {'APPLE_SIGN_IN_CLIENT_ID','APPLE_TEAM_ID','APPLE_KEY_ID','APPLE_PRIVATE_KEY'}
    copied = {k:v for k,v in production.items() if k.startswith(prefixes) or k in names}
    assert copied.get('SMS_PROVIDER') == 'aliyun'
    target.update(copied)
    client = dict(line.split('=',1) for line in (ROOT/'client.env').read_text().splitlines() if '=' in line)
    target.update({
        'NODE_ENV': 'production',
        'TESTING_CONTENT_CREDENTIAL_PUBLIC_KEY': client['EXPO_PUBLIC_ICAO_CONTENT_PUBLIC_KEY'],
        'ACCOUNT_IDENTITY_HASH_SECRET': production['ACCOUNT_IDENTITY_HASH_SECRET'],
        'IDENTITY_BENEFIT_DIGEST_SECRET': production['IDENTITY_BENEFIT_DIGEST_SECRET'],
        'APPLE_CREDENTIAL_ENCRYPTION_KEY': base64.b64encode(secrets.token_bytes(32)).decode(),
        'SUPABASE_SMS_HOOK_SECRET': 'v1,whsec_' + base64.b64encode(secrets.token_bytes(32)).decode(),
        'WECHAT_PAY_NOTIFY_URL': 'https://test-api.readyoufife.com/v1/commerce/wechat/notifications',
    })
    auth = compose['services']['auth']['environment']
    production_auth = env('supabase-auth')
    for k,v in production_auth.items():
        if k.startswith(('GOTRUE_PASSWORD_', 'GOTRUE_SECURITY_', 'GOTRUE_RATE_LIMIT_', 'GOTRUE_SMS_')):
            if not k.startswith('GOTRUE_SMS_TEST_'): auth[k] = v
        if k in ('GOTRUE_EXTERNAL_APPLE_ENABLED','GOTRUE_EXTERNAL_APPLE_CLIENT_ID'): auth[k] = v
    auth.pop('GOTRUE_SMS_TEST_OTP', None)
    auth.pop('GOTRUE_SMS_TEST_OTP_VALID_UNTIL', None)
    auth.update({'GOTRUE_HOOK_SEND_SMS_ENABLED':'true',
                 'GOTRUE_HOOK_SEND_SMS_URI':'http://host.docker.internal:3101/v1/hooks/supabase/send-sms',
                 'GOTRUE_HOOK_SEND_SMS_SECRETS':target['SUPABASE_SMS_HOOK_SECRET']})
    # GoTrue permits HTTP hooks on this hostname. It resolves ONLY to the testing
    # API container here, never to the host gateway or production service.
    compose['services']['auth']['extra_hosts'] = ['host.docker.internal:172.30.244.10']
    compose['networks']['egress'] = {'name':'icao-testing-egress','ipam':{'config':[{'subnet':str(subnet)}]}}
    for name,ip in [('api','172.30.245.10'),('auth','172.30.245.12')]:
        networks = compose['services'][name]['networks']
        if isinstance(networks,list): networks = {key:{} for key in networks}
        networks['egress'] = {'ipv4_address':ip}
        compose['services'][name]['networks'] = networks
    # Install the narrowly scoped firewall BEFORE attaching the public route.
    subprocess.run(['sh',str(Path(__file__).with_name('full-runtime-egress.sh'))],check=True)
    compose_path.write_text(json.dumps(compose,indent=2))
    # WeChat stores a one-way provider subject in Auth metadata. Keep its
    # existing derivation key so restored users resolve to their original account.
    subprocess.run(['python3',str(Path(__file__).with_name('rekey-identities.py'))],check=True)
    subprocess.run(['docker','compose','-f',str(compose_path),'up','-d','--no-deps','api','auth'],check=True)
    evidence = {'environment':'testing','enabledAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),
                'providerSettingsReused':sorted(copied), 'backup':str(backup),
                'nodeEnvironment':'production','dataEnvironment':'testing'}
    (ROOT/'full-runtime.json').write_text(json.dumps(evidence,indent=2))
    print('Testing full runtime enabled; provider accounts reused; production unchanged.')

if __name__ == '__main__':
    main()
