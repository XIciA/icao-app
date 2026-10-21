import 'reflect-metadata';
import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { createOpsApp } from './create-ops-app';
import { loadOpsConfig } from './config';
import { AdminAuthService } from './admin/admin-auth.service';
import { runOpsStaffProvision } from './admin/admin-provisioning';
import { totpCodeAt } from './admin/admin-crypto';
import { refreshLocalMonitor } from './admin/local-monitor-bridge';
import type { OpsStaffSession } from '@icao/contracts';

async function main(){
  const root=resolve(__dirname,'../../..');
  const home=join(homedir(),'.config/icao-app/local-ops');
  await mkdir(home,{recursive:true,mode:0o700});
  let monitorRefreshing=false;
  const refreshMonitor=async()=>{if(monitorRefreshing)return;monitorRefreshing=true;try{await refreshLocalMonitor(root,home,join(homedir(),'.ssh/icao_app_codex'));}catch{/* Timestamp preserves missing/stale state. */}finally{monitorRefreshing=false;}};
  void refreshMonitor();
  const monitorTimer=setInterval(()=>void refreshMonitor(),60_000);monitorTimer.unref();
  const settingsPath=join(home,'connection.json');
  let settings:Record<string,string>;
  try { const info=await stat(settingsPath);if(info.mode&0o077)throw new Error('private_file_permissions');settings=JSON.parse(await readFile(settingsPath,'utf8')); }
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
    // Read only the two required server values; never print server environments.
    const script="const e=process.env;process.stdout.write(JSON.stringify({databaseUrl:e.DATABASE_URL,identitySecret:e.ACCOUNT_IDENTITY_HASH_SECRET,storageToken:e.SUPABASE_SECRET_KEY}))";
    const raw=execFileSync('ssh',['-i',join(homedir(),'.ssh/icao_app_codex'),'-o','BatchMode=yes','-o','ConnectTimeout=10','root@47.108.90.19',`docker exec icao-api node -e '${script}'`],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
    const remote=JSON.parse(raw);if(!remote.databaseUrl||!remote.identitySecret)throw new Error('server_config_unavailable');
    const url=new URL(remote.databaseUrl);url.hostname='127.0.0.1';url.port='15432';
    settings={DATABASE_URL:url.toString(),ACCOUNT_IDENTITY_HASH_SECRET:remote.identitySecret,
      OPS_FEEDBACK_STORAGE_URL:'http://127.0.0.1:18000/storage/v1',OPS_FEEDBACK_STORAGE_READ_TOKEN:remote.storageToken,
      OPS_SESSION_HASH_SECRET:randomBytes(32).toString('hex'),OPS_TOTP_ENCRYPTION_KEY:randomBytes(32).toString('base64'),OPS_TRUSTED_PROXY_SHARED_SECRET:randomBytes(32).toString('hex'),
      password:randomBytes(32).toString('base64url'),email:'local-owner@readyoufife.com'};
    await writeFile(settingsPath,JSON.stringify(settings),{mode:0o600});
  }
  const databaseHost=execFileSync('ssh',['-i',join(homedir(),'.ssh/icao_app_codex'),'-o','BatchMode=yes','root@47.108.90.19',"docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' supabase-db"],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().split(/\s+/)[0];
  if(!databaseHost || !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(databaseHost))throw new Error('database_tunnel_target_unavailable');
  const ssh=spawn('ssh',['-N','-i',join(homedir(),'.ssh/icao_app_codex'),'-o','BatchMode=yes','-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=20','-o','ServerAliveCountMax=3','-L',`127.0.0.1:15432:${databaseHost}:5432`,'-L','127.0.0.1:18000:127.0.0.1:8000','root@47.108.90.19'],{stdio:'ignore'});
  // App is assigned after provisioning; shutdown may happen before it is ready.
  // eslint-disable-next-line prefer-const
  let app: Awaited<ReturnType<typeof createOpsApp>>|undefined;
  process.on('exit',()=>ssh.kill());
  const stop=()=>{ssh.kill();void app?.close();};process.on('SIGINT',()=>{stop();process.exit(0);});process.on('SIGTERM',()=>{stop();process.exit(0);});
  ssh.on('exit',()=>{console.error('服务器连接已断开，请重新打开后台。');process.exit(1);});
  await new Promise(r=>setTimeout(r,1200));
  Object.assign(process.env,settings,{NODE_ENV:'test',OPS_ENABLED:'1',OPS_CORS_ORIGINS:'http://127.0.0.1:4173'});
  const deliveryPath=join(home,'staff.json');
  try{await stat(deliveryPath);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
    await runOpsStaffProvision({...process.env,OPS_PROVISION_EMAIL:settings.email,OPS_PROVISION_PASSWORD:settings.password,OPS_PROVISION_ROLE:'admin',OPS_PROVISION_OUTPUT_FILE:deliveryPath},root);
  }
  const delivery=JSON.parse(await readFile(deliveryPath,'utf8'));
  app=await createOpsApp(loadOpsConfig());
  const auth=app.get(AdminAuthService);let session:OpsStaffSession|undefined;
  const sessionPath=join(home,'session.json');
  try { session=JSON.parse(await readFile(sessionPath,'utf8')); } catch { /* first launch */ }
  async function authenticate(){if(session&&Date.parse(session.expiresAt)>Date.now()+60000){try{await auth.authenticate(session.accessToken);return session;}catch{session=undefined;}}
    session=await auth.login({email:settings.email!,password:settings.password!,totpCode:totpCodeAt(delivery.totpSecret),deviceName:'本地管理后台'},randomUUID(),'127.0.0.1');await writeFile(sessionPath,JSON.stringify(session),{mode:0o600});return session;}
  await authenticate();
  const cookie=randomBytes(32).toString('hex');const dist=join(root,'apps/ops/dist');
  const allowed=/^\/v1\/admin\/(?:stability|content-orders(?:\/[^?]*)?|feedback(?:\/[^?]*)?|ai-rules(?:\/(?:preview|publish))?|users(?:\/(?:search|operations|[\w-]+\/detail|reset-allowances\/(?:preview|[\w-]+\/execute)))?|reports\/(?:usage|clicks|accounts\/[\w-]+)|review-entitlements\/(?:preview|[\w-]+\/execute))(?:\?.*)?$/;
  const server=createServer(async(req,res)=>{
    try{
      if(req.headers.host!=='127.0.0.1:4173'||req.headers['sec-fetch-site']==='cross-site'){res.writeHead(403).end();return;}
      const path=req.url??'/';
      if(path.startsWith('/v1/')||path==='/local/session'){
        if(!req.headers.cookie?.split(';').some(c=>c.trim()===`ops-local=${cookie}`)){res.writeHead(401).end();return;}
        if(!['GET','HEAD'].includes(req.method??'GET')&&req.headers.origin!=='http://127.0.0.1:4173'){res.writeHead(403).end();return;}
        const current=await authenticate();
        res.setHeader('cache-control','no-store');
        if(path==='/local/session'){res.setHeader('content-type','application/json');res.end(JSON.stringify({data:{staff:current.staff}}));return;}
        if(!allowed.test(path)){res.writeHead(404).end();return;}
        const bodyLimit=/^\/v1\/admin\/content-orders\/[0-9a-f-]+\/prepare$/.test(path)?20_000_000:(path==='/v1/admin/content-orders'||/^\/v1\/admin\/content-orders\/[0-9a-f-]+\/append$/.test(path))?12_000_000:1_048_576;
        const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>bodyLimit){res.writeHead(413).end();return;}chunks.push(chunk);}
        const response=await app!.getHttpAdapter().getInstance().inject({method:(req.method ?? 'GET') as 'GET' | 'POST',url:path,headers:{authorization:`Bearer ${current.accessToken}`,'content-type':req.headers['content-type']??'application/json','x-ops-reason':'本地管理员查看与管理'},payload:size?Buffer.concat(chunks):undefined});
        res.writeHead(response.statusCode,{'content-type':response.headers['content-type']??'application/json'});res.end(response.rawPayload);return;
      }
      if(!['GET','HEAD'].includes(req.method??'')){res.writeHead(405).end();return;}
      const relative=decodeURIComponent(path.split('?')[0]!);const file=relative==='/'?join(dist,'index.html'):resolve(dist,'.'+relative);
      if(!file.startsWith(dist+'/')){res.writeHead(403).end();return;}
      const content=await readFile(file);
      res.setHeader('set-cookie',`ops-local=${cookie}; HttpOnly; SameSite=Strict; Path=/`);
      res.setHeader('cache-control','no-store');res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'} as Record<string,string>)[extname(file)]??'application/octet-stream');res.end(content);
    }catch{res.writeHead(503,{'content-type':'application/json'}).end(JSON.stringify({error:{code:'local_connection_unavailable'}}));}
  });
  server.listen(4173,'127.0.0.1',()=>console.log('后台已就绪：http://127.0.0.1:4173'));
}
void main().catch(()=>{console.error('后台启动未完成，请检查本机连接和私有配置；详细凭据不会输出。');process.exit(1);});
