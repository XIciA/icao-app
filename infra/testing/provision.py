#!/usr/bin/env python3
"""Create ONLY /opt/icao/testing. Run on the project ECS; never emits secrets.
Uses inspected immutable production image IDs, fresh credentials and a network
with no external route. Database restore is a separate, explicit operation.
"""
import base64
import hashlib
import hmac
import json
import ipaddress
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import time

ROOT = Path('/opt/icao/testing')
PROJECT = 'icao-testing'
API = 'https://test-api.readyoufife.com'
CLOUD = 'https://test-cloud.readyoufife.com'


def inspect(name):
    return json.loads(subprocess.check_output(['docker', 'inspect', name]))[0]


def write(name, value):
    path = ROOT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value)
    path.chmod(0o600)


def main():
    os.umask(0o077)
    if ROOT.exists():
        raise SystemExit('testing_directory_exists: inspect it; provisioning never overwrites credentials/data')
    if shutil.disk_usage('/opt/icao').free < 18 * 1024**3:
        raise SystemExit('testing_requires_18GiB_free_before_restore')
    names = {'db': 'supabase-db', 'auth': 'supabase-auth', 'rest': 'supabase-rest',
             'storage': 'supabase-storage', 'kong': 'supabase-kong',
             'imgproxy': 'supabase-imgproxy', 'mailpit': 'supabase-mailpit', 'api': 'icao-api'}
    live = {key: inspect(name) for key, name in names.items()}
    assert all(d['State']['Running'] for d in live.values())
    testing_subnet = ipaddress.ip_network('172.30.244.0/24')
    for network_id in subprocess.check_output(['docker', 'network', 'ls', '-q'], text=True).split():
        network = json.loads(subprocess.check_output(['docker', 'network', 'inspect', network_id]))[0]
        for item in network.get('IPAM', {}).get('Config') or []:
            subnet = item.get('Subnet')
            if subnet and ipaddress.ip_network(subnet).version == 4:
                assert not testing_subnet.overlaps(ipaddress.ip_network(subnet)), 'testing_subnet_conflict'
    ROOT.mkdir(mode=0o700)
    password, jwt = secrets.token_hex(32), secrets.token_hex(48)
    def token(role):
        def b64(value):
            return base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).decode().rstrip('=')
        body = b64({'alg': 'HS256', 'typ': 'JWT'}) + '.' + b64({'role': role, 'iss': 'supabase', 'iat': int(time.time()), 'exp': int(time.time()) + 10 * 365 * 86400})
        return body + '.' + base64.urlsafe_b64encode(hmac.new(jwt.encode(), body.encode(), hashlib.sha256).digest()).decode().rstrip('=')
    anon, service = token('anon'), token('service_role')
    private_key = subprocess.check_output(['openssl', 'genpkey', '-algorithm', 'ED25519'])
    public_der = subprocess.check_output(['openssl', 'pkey', '-pubout', '-outform', 'DER'], input=private_key)
    public_key = base64.b64encode(public_der[-32:]).decode()
    otp = str(secrets.randbelow(900000) + 100000)
    credentials = {'postgresPassword': password, 'jwtSecret': jwt, 'anonKey': anon, 'serviceKey': service,
                   'testPhone': '8619900000001', 'testOtp': otp}
    write('credentials.json', json.dumps(credentials))
    def dburl(role):
        return f'postgresql://{role}:{password}@db:5432/icao_testing'
    def svc(key, env, **kwargs):
        return {'image': live[key]['Image'], 'container_name': f'icao-testing-{key}',
                'restart': 'unless-stopped', 'networks': ['isolated'],
                'environment': {k: str(v) for k, v in env.items()},
                'logging': {'driver': 'json-file', 'options': {'max-size': '10m', 'max-file': '3'}},
                **kwargs}
    # Copy reviewed initializer files, never live PostgreSQL files or production env.
    init = ROOT / 'init'
    init.mkdir()
    for name in ['roles.sql', 'jwt.sql']:
        shutil.copyfile('/opt/icao/runtime/supabase/volumes/db/' + name, init / name)
        (init / name).chmod(0o644)
    services = {
        'db': svc('db', {'POSTGRES_PASSWORD': password, 'PGPASSWORD': password,
                        'POSTGRES_DB': 'postgres', 'JWT_SECRET': jwt, 'JWT_EXP': '3600'},
                  command=live['db']['Config']['Cmd'], shm_size='256m', mem_limit='2g',
                  volumes=[f'{ROOT}/db:/var/lib/postgresql/data',
                           f'{init}/roles.sql:/docker-entrypoint-initdb.d/init-scripts/99-roles.sql:ro',
                           f'{init}/jwt.sql:/docker-entrypoint-initdb.d/init-scripts/99-jwt.sql:ro'],
                  healthcheck={'test': ['CMD', 'pg_isready', '-U', 'postgres'], 'interval': '5s', 'timeout': '5s', 'retries': 30}),
        'auth': svc('auth', {
            'GOTRUE_API_HOST': '0.0.0.0', 'GOTRUE_API_PORT': '9999', 'API_EXTERNAL_URL': CLOUD,
            'GOTRUE_DB_DRIVER': 'postgres', 'GOTRUE_DB_DATABASE_URL': dburl('supabase_auth_admin'),
            'GOTRUE_SITE_URL': API, 'GOTRUE_URI_ALLOW_LIST': 'readyoufife://**',
            'GOTRUE_JWT_SECRET': jwt, 'GOTRUE_JWT_EXP': '3600', 'GOTRUE_JWT_AUD': 'authenticated',
            'GOTRUE_JWT_DEFAULT_GROUP_NAME': 'authenticated', 'GOTRUE_JWT_ADMIN_ROLES': 'service_role',
            'GOTRUE_DISABLE_SIGNUP': 'false', 'GOTRUE_EXTERNAL_PHONE_ENABLED': 'true',
            'GOTRUE_SMS_AUTOCONFIRM': 'false', 'GOTRUE_SMS_TEST_OTP': '8619900000001:' + otp,
            'GOTRUE_SMS_TEST_OTP_VALID_UNTIL': '2027-11-27T00:00:00Z',
            'GOTRUE_SMS_OTP_LENGTH': '6', 'GOTRUE_SMS_OTP_EXP': '300',
            'GOTRUE_EXTERNAL_EMAIL_ENABLED': 'true', 'GOTRUE_MAILER_AUTOCONFIRM': 'false',
            'GOTRUE_SMTP_HOST': 'mailpit', 'GOTRUE_SMTP_PORT': '1025',
            'GOTRUE_SMTP_ADMIN_EMAIL': 'testing@readyoufife.com', 'GOTRUE_SMTP_SENDER_NAME': 'ICAO Testing',
            'GOTRUE_PASSWORD_MIN_LENGTH': '8', 'GOTRUE_RATE_LIMIT_SMS_SENT': '100',
        }, mem_limit='256m'),
        'rest': svc('rest', {'PGRST_DB_URI': dburl('authenticator'), 'PGRST_DB_SCHEMAS': 'public,storage',
                            'PGRST_DB_ANON_ROLE': 'anon', 'PGRST_JWT_SECRET': jwt,
                            'PGRST_DB_EXTRA_SEARCH_PATH': 'public,extensions'}, mem_limit='256m'),
        'storage': svc('storage', {'ANON_KEY': anon, 'SERVICE_KEY': service, 'AUTH_JWT_SECRET': jwt,
                                  'DATABASE_URL': dburl('supabase_storage_admin'), 'POSTGREST_URL': 'http://rest:3000',
                                  'STORAGE_BACKEND': 'file', 'FILE_STORAGE_BACKEND_PATH': '/var/lib/storage',
                                  'TENANT_ID': 'stub', 'REGION': 'stub', 'GLOBAL_S3_BUCKET': 'stub',
                                  'FILE_SIZE_LIMIT': '52428800', 'ENABLE_IMAGE_TRANSFORMATION': 'true',
                                  'IMGPROXY_URL': 'http://imgproxy:5001', 'STORAGE_PUBLIC_URL': CLOUD + '/storage/v1'},
                       volumes=[f'{ROOT}/storage:/var/lib/storage'], mem_limit='1536m'),
        'imgproxy': svc('imgproxy', {'IMGPROXY_BIND': ':5001', 'IMGPROXY_LOCAL_FILESYSTEM_ROOT': '/',
                                    'IMGPROXY_USE_ETAG': 'true', 'IMGPROXY_ENABLE_WEBP_DETECTION': 'true'},
                       volumes=[f'{ROOT}/storage:/var/lib/storage:ro'], mem_limit='256m'),
        'mailpit': svc('mailpit', {'MP_MAX_MESSAGES': '200'}, mem_limit='128m'),
        'kong': svc('kong', {'KONG_DATABASE': 'off', 'KONG_DECLARATIVE_CONFIG': '/home/kong/testing.json',
                            'KONG_DNS_ORDER': 'LAST,A,CNAME', 'KONG_PLUGINS': 'cors,key-auth,acl',
                            'KONG_NGINX_WORKER_PROCESSES': '1', 'KONG_PROXY_ACCESS_LOG': '/dev/null'},
                    volumes=[f'{ROOT}/kong.json:/home/kong/testing.json:ro'],
                    mem_limit='512m'),
        'api': svc('api', {'NODE_ENV': 'test', 'HOST': '0.0.0.0', 'PORT': '3101',
                          'ICAO_DATA_ENVIRONMENT': 'testing', 'API_RELEASE_ID': 'testing-baseline-bd9b8988', 'DATABASE_URL': dburl('postgres'),
                          'SUPABASE_URL': 'http://kong:8000', 'SUPABASE_PUBLIC_URL': CLOUD,
                          'SUPABASE_PUBLISHABLE_KEY': anon, 'SUPABASE_SECRET_KEY': service,
                          'INVITE_AUTH_SECRET': secrets.token_hex(32),
                          'ACCOUNT_IDENTITY_HASH_SECRET': secrets.token_hex(32),
                          'CONTENT_CREDENTIAL_SIGNING_SECRET': secrets.token_hex(32),
                          'CONTENT_CREDENTIAL_SIGNING_PRIVATE_KEY': private_key.decode(),
                          'SMS_PROVIDER': 'disabled', 'CORS_ORIGINS': API},
                   mem_limit='768m'),
    }
    services['api']['networks'] = {'isolated': {'ipv4_address': '172.30.244.10'}}
    services['kong']['networks'] = {'isolated': {'ipv4_address': '172.30.244.11'}}
    kong = {'_format_version': '3.0', 'consumers': [
        {'username': 'anon', 'keyauth_credentials': [{'key': anon}], 'acls': [{'group': 'anon'}]},
        {'username': 'service_role', 'keyauth_credentials': [{'key': service}], 'acls': [{'group': 'admin'}]},
    ], 'services': []}
    for name, url, prefix in [('auth','http://auth:9999/','/auth/v1/'), ('rest','http://rest:3000/','/rest/v1/'), ('storage','http://storage:5000/','/storage/v1/')]:
        kong['services'].append({'name': name, 'url': url,
            'routes': [{'name': name, 'strip_path': True, 'paths': [prefix]}],
            'plugins': [{'name': 'cors'}, {'name': 'key-auth', 'config': {'key_names': ['apikey'], 'hide_credentials': False}},
                        {'name': 'acl', 'config': {'allow': ['anon', 'admin'], 'hide_groups_header': True}}]})
    # Storage validates JWT/signed URLs itself; public media requests carry no apikey.
    next(service for service in kong['services'] if service['name'] == 'storage')['plugins'] = [{'name': 'cors'}]
    write('kong.json', json.dumps(kong))
    # Kong runs as its own uid; the private parent directory still protects this file on host.
    (ROOT / 'kong.json').chmod(0o644)
    compose = {'name': PROJECT, 'services': services,
               'networks': {'isolated': {'name': PROJECT, 'internal': True, 'ipam': {'config': [{'subnet': str(testing_subnet)}]}}}}
    write('compose.json', json.dumps(compose, indent=2))
    write('baseline.json', json.dumps({k: {'image': v['Image'], 'containerId': v['Id'], 'startedAt': v['State']['StartedAt']} for k, v in live.items()}, indent=2))
    write('client.env', f'ICAO_RELEASE_ENVIRONMENT=testing\nEXPO_PUBLIC_ICAO_DATA_ENVIRONMENT=testing\nEXPO_PUBLIC_ICAO_API_URL={API}\nEXPO_PUBLIC_SUPABASE_URL={CLOUD}\nEXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY={anon}\nEXPO_PUBLIC_ICAO_CONTENT_PUBLIC_KEY={public_key}\n')
    print('Created isolated testing configuration; no production credentials copied; no services started.')


if __name__ == '__main__':
    main()
