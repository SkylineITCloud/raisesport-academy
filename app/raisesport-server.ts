import {pages} from './website-pages';

type Env={DB?:D1Database;RAISESPORT_DEMO_MODE?:string};
type User={id:number;name:string;email:string;password:string;role:string;created:number};
const homes:Record<string,string>={athlete:'/athlete/',coach:'/coach/',academy_manager:'/manager/'};
const prices:Record<string,number>={'Beanie':150,'Hoodie':399,'Jacket':550,'T-Shirt':349,'Match Ball':450,'Supporter Scarf':220,'Baseball Cap':280,'Goalkeeper Gloves':270,'Backpack & Socks Set':540,'DAD Ball':399,'Training Bibs':650,'Agility Training Kit':700};
const now=()=>Date.now()/1000;
const hex=(bytes:ArrayBuffer|Uint8Array)=>Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,'0')).join('');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const digest=async(value:string)=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
class Problem extends Error{constructor(message:string,public status=400){super(message);}}
function check(value:unknown,message:string,status=400):asserts value{if(!value)throw new Problem(message,status);}
function field(body:any,key:string,limit=200){const value=body[key]??'';check(typeof value==='string'&&value.length<=limit,'Please check '+key+'.');return value.trim();}
function email(body:any){const value=field(body,'email',254).toLowerCase();check(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value),'Enter a valid email address.');return value;}
async function hashPassword(value:string,salt=hex(crypto.getRandomValues(new Uint8Array(16)))){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(value),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256);
 return 'pbkdf2:'+salt+':'+hex(bits);
}
async function matches(value:string,stored:string){const parts=stored.split(':');if(parts.length!==3||parts[0]!=='pbkdf2')return false;const given=await hashPassword(value,parts[1]);let diff=given.length^stored.length;for(let i=0;i<given.length;i++)diff|=given.charCodeAt(i)^(stored.charCodeAt(i)||0);return diff===0;}
function cookie(value='',remove=false,secure=true){return 'rs_session='+value+'; Path=/; HttpOnly; SameSite=Strict'+(secure?'; Secure':'')+(remove?'; Max-Age=0':'');}
function token(request:Request){const bearer=request.headers.get('Authorization');if(bearer?.startsWith('Bearer '))return bearer.slice(7);return request.headers.get('Cookie')?.match(/(?:^|;\s*)rs_session=([^;]+)/)?.[1]||'';}
function json(value:unknown,status=200,setCookie?:string){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(setCookie?{'Set-Cookie':setCookie}:{})}});}
function redirect(path:string){return new Response(null,{status:303,headers:{Location:path,'Cache-Control':'no-store'}});}
let seeded=false;

export async function application(request:Request,env:Env):Promise<Response>{
 const url=new URL(request.url),path=decodeURIComponent(url.pathname),secure=url.protocol==='https:';
 if(!env.DB)return json({error:'The online database is not connected yet.'},503);
 const db=env.DB;
 const one=async(sql:string,...args:any[])=>db.prepare(sql).bind(...args).first<any>();
 const all=async(sql:string,...args:any[])=>(await db.prepare(sql).bind(...args).all<any>()).results;
 const run=async(sql:string,...args:any[])=>db.prepare(sql).bind(...args).run();
 const user=async():Promise<User>=>{const value=token(request);const found=value?await one('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>? AND s.last_seen>?',await digest(value),now(),now()-900):null;check(found&&homes[found.role],'Please sign in again.',401);return found;};
 const sessionInfo=async()=>{const row=await one('SELECT expires,last_seen FROM sessions WHERE token=?',await digest(token(request)));return row?{idleSeconds:900,idleExpires:row.last_seen+900,absoluteExpires:row.expires}:null;};
 const startSession=async(u:User)=>{const value=random(),time=now(),previous=token(request);if(previous)await run('DELETE FROM sessions WHERE token=?',await digest(previous));await run('DELETE FROM sessions WHERE expires<?',time);await run('INSERT INTO sessions(token,user_id,expires,last_seen) VALUES (?,?,?,?)',await digest(value),u.id,time+28800,time);return json({token:value,name:u.name,email:u.email,role:u.role,home:homes[u.role],emailVerified:false,needsVerification:false,session:{idleSeconds:900,idleExpires:time+900,absoluteExpires:time+28800}},200,cookie(value,false,secure));};
 const staff=async()=>{const u=await user();check(['coach','academy_manager'].includes(u.role),'Coach or manager access is required.',403);return u;};
 const manager=async()=>{const u=await user();check(u.role==='academy_manager','Manager access is required.',403);return u;};
 const requireAthlete=async(u:User,id:number)=>{check(Number.isInteger(id),'Choose an athlete.');if(u.role!=='academy_manager')check(await one('SELECT 1 FROM athlete_assignments WHERE athlete_id=? AND manager_id=?',id,u.id),'This athlete is not assigned to you.',403);check(await one("SELECT 1 FROM users WHERE id=? AND role='athlete'",id),'Athlete not found.',404);};
 const athleteRecord=async(id:number,privateNotes=false)=>{
  const u=await one("SELECT id,name,email,role,created FROM users WHERE id=? AND role='athlete'",id);check(u,'Athlete not found.',404);
  await run('INSERT OR IGNORE INTO athlete_profiles(user_id) VALUES (?)',id);
  return {user:u,profile:await one('SELECT * FROM athlete_profiles WHERE user_id=?',id),subscription:await one('SELECT '+(privateNotes?'*':'user_id,plan,billing,amount,status,created,updated')+' FROM subscriptions WHERE user_id=?',id),manager:await one('SELECT u.id,u.name,u.email FROM users u JOIN athlete_assignments a ON a.manager_id=u.id WHERE a.athlete_id=?',id),events:await all('SELECT * FROM athlete_events WHERE athlete_id=? ORDER BY starts',id),messages:await all('SELECT id,author,body,created FROM athlete_messages WHERE athlete_id=? ORDER BY created DESC LIMIT 100',id)};
 };
 try{
  if(path.startsWith('/api/')&&env.RAISESPORT_DEMO_MODE==='true'&&!seeded){
   const hash=await hashPassword('password');
   await db.batch([['Athlete','athlete@gmail.com','athlete'],['Coach','coach@gmail.com','coach'],['Manager','manager@gmail.com','academy_manager']].map(([name,email,role])=>db.prepare('INSERT OR IGNORE INTO users(name,email,password,verified,created,role) VALUES (?,?,?,1,?,?)').bind(name,email,hash,now(),role)));
   await db.batch([
    db.prepare("INSERT OR IGNORE INTO athlete_profiles(user_id,sport) SELECT id,'Football' FROM users WHERE email='athlete@gmail.com'"),
    db.prepare("INSERT OR IGNORE INTO subscriptions(user_id,plan,billing,amount,status,created,updated,notes) SELECT id,'Starter Athlete','monthly',150,'active',?,?,'Online demonstration membership; no payment recorded.' FROM users WHERE email='athlete@gmail.com'").bind(now(),now()),
    db.prepare("INSERT OR IGNORE INTO athlete_assignments(athlete_id,manager_id) SELECT a.id,c.id FROM users a,users c WHERE a.email='athlete@gmail.com' AND c.email='coach@gmail.com'")
   ]);seeded=true;
  }
  if(!path.startsWith('/api/')){
   const canonical=path.endsWith('/')?path:path.endsWith('/index.html')?path.slice(0,-10):path+'/';
   const role:Record<string,string>={'/athlete/':'athlete','/coach/':'coach','/manager/':'academy_manager','/team/':'academy_manager'};
   if(role[canonical]){let u;try{u=await user();}catch{return redirect('/login/');}if(u.role!==role[canonical])return redirect(homes[u.role]);}
   const html=pages[canonical];return html?new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}}):json({error:'Not found.'},404);
  }
  if(path==='/api/health')return json({ok:true,service:'raisesport-cloud',version:6});
  if(path==='/api/products'&&request.method==='GET')return json({prices});
  if(request.method==='POST')check(!request.headers.get('Origin')||request.headers.get('Origin')===url.origin,'Use this website for the request.',403);
  const raw=request.method==='POST'?await request.text():'';check(raw.length<=32768,'Request is too large.',413);
  let body:any={};if(raw){try{body=JSON.parse(raw);}catch{throw new Problem('Invalid request.');}}check(body&&typeof body==='object'&&!Array.isArray(body),'Invalid request.');
  if(path==='/api/auth/logout'||path==='/api/manager/logout'){await run('DELETE FROM sessions WHERE token=?',await digest(token(request)));return json({ok:true},200,cookie('',true,secure));}
  if(path==='/api/auth/me'){const u=await user();return json({user:{id:u.id,name:u.name,email:u.email,role:u.role},home:homes[u.role],session:await sessionInfo()});}
  if(path==='/api/auth/activity'&&request.method==='POST'){await user();await run('UPDATE sessions SET last_seen=? WHERE token=?',now(),await digest(token(request)));return json({ok:true,session:await sessionInfo()});}
  if(['/api/auth/login','/api/auth/signup','/api/manager/login'].includes(path)&&request.method==='POST'){
   const address=email(body),pw=body.password;check(typeof pw==='string'&&pw.length<=256,'Please check your password.');
   let u=await one('SELECT * FROM users WHERE email=?',address);
   if(path==='/api/auth/signup'){
    const name=field(body,'name'),phone=field(body,'phone',40),billing=body.billing||'monthly';check(name.length>=2&&pw.length>=8,'Enter your name and a password of at least 8 characters.');check(['monthly','annual'].includes(billing),'Choose a valid billing period.');check(!body.role||body.role==='athlete','Only athlete accounts can register here.',403);check(!u,'This email is already registered. Please sign in.',409);
    const hash=await hashPassword(pw),time=now();await db.batch([
     db.prepare("INSERT INTO users(name,email,password,verified,created,role) VALUES (?,?,?,1,?,'athlete')").bind(name,address,hash,time),
     db.prepare('INSERT INTO athlete_profiles(user_id,phone) SELECT id,? FROM users WHERE email=?').bind(phone,address),
     db.prepare("INSERT INTO subscriptions(user_id,plan,billing,amount,status,created,updated) SELECT id,'Starter Athlete',?,?,'pending',?,? FROM users WHERE email=?").bind(billing,billing==='annual'?1440:150,time,time,address)
    ]);u=await one('SELECT * FROM users WHERE email=?',address);
   }else{
    await run('DELETE FROM account_login_attempts WHERE created<?',now()-60);const attempts=await one('SELECT COUNT(*) AS n FROM account_login_attempts WHERE email=?',address);check(attempts.n<8,'Too many attempts. Please wait one minute.',429);await run('INSERT INTO account_login_attempts(email,created) VALUES (?,?)',address,now());check(u&&await matches(pw,u.password),'Incorrect email or password.',401);if(path==='/api/manager/login')check(u.role==='academy_manager','Manager access is required.',403);await run('DELETE FROM account_login_attempts WHERE email=?',address);
   }return startSession(u);
  }
  if(path==='/api/contact'&&request.method==='POST'){const name=field(body,'name'),address=email(body),message=field(body,'message',10000);check(name&&message,'Enter your name and message.');await run('INSERT INTO contacts(name,email,subject,message,created,phone,status,notes) VALUES (?,?,?,?,?,?,?,?)',name,address,field(body,'subject'),message,now(),field(body,'phone',40),'new','');return json({ok:true});}
  if(path==='/api/newsletter'&&request.method==='POST'){await run('INSERT OR IGNORE INTO newsletter(email,created) VALUES (?,?)',email(body),now());return json({ok:true});}
  if(path==='/api/me'){const u=await user();return json({user:{name:u.name,email:u.email,role:u.role},subscription:await one('SELECT plan,billing,amount,status FROM subscriptions WHERE user_id=?',u.id),orders:await all('SELECT ref,items,total,status FROM orders WHERE user_id=? ORDER BY created DESC',u.id)});}
  if(path==='/api/subscriptions'&&request.method==='POST'){
   const u=await user();check(u.role==='athlete','Only athlete accounts can request memberships.',403);const billing=field(body,'billing');check(field(body,'plan')==='Starter Athlete'&&['monthly','annual'].includes(billing),'Choose a valid membership.');const existing=await one('SELECT status FROM subscriptions WHERE user_id=?',u.id);check(existing?.status!=='active','Your membership is already active. Contact the academy to change it.');const amount=billing==='annual'?1440:150;
   await run("INSERT INTO subscriptions(user_id,plan,billing,amount,status,created,updated) VALUES (?,'Starter Athlete',?,?,'pending',?,?) ON CONFLICT(user_id) DO UPDATE SET billing=excluded.billing,amount=excluded.amount,status='pending',updated=excluded.updated",u.id,billing,amount,now(),now());return json({plan:'Starter Athlete',amount,status:'pending'});
  }
  if(path==='/api/orders'&&request.method==='POST'){
   const u=await user();check(u.role==='athlete','Only athletes can place orders.',403);check(Array.isArray(body.items)&&body.items.length>=1&&body.items.length<=20,'Add products to your cart.');let total=0;const seen=new Set(),lines=[];
   for(const item of body.items){check(item&&typeof item.name==='string'&&Object.hasOwn(prices,item.name)&&Number.isInteger(item.qty)&&item.qty>=1&&item.qty<=20&&!seen.has(item.name),'Invalid product or quantity.');seen.add(item.name);total+=prices[item.name]*item.qty;lines.push({name:item.name,qty:item.qty,unit_price:prices[item.name]});}
   const fulfilment=field(body,'fulfilment')||'collection',phone=field(body,'phone',40),address=field(body,'address',1000),name=field(body,'name')||u.name;check(name.length>=2&&['collection','delivery'].includes(fulfilment),'Check your contact name and fulfilment choice.');check(fulfilment!=='delivery'||(phone&&address),'Enter your phone and delivery address.');const ref='RS-'+random().slice(0,10).toUpperCase();
   await run("INSERT INTO orders(ref,user_id,items,total,status,created,phone,address,fulfilment,lines,customer_name,customer_notes,notes) VALUES (?,?,?,?,'pending',?,?,?,?,?,?,?,'')",ref,u.id,lines.map(l=>l.qty+' x '+l.name).join(', '),total,now(),phone,address,fulfilment,JSON.stringify(lines),name,field(body,'customer_notes',2000));return json({ref,total,discount:0,status:'pending'});
  }
  if(path==='/api/payfast/checkout'){await user();throw new Problem('PayFast is coming soon. No payment has been taken.',503);}
  if(path==='/api/members/password'||path==='/api/manager/password'){
   const u=path.includes('/manager/')?await manager():await user();check(request.method==='POST','Not found.',404);check(typeof body.current==='string'&&typeof body.password==='string'&&body.password.length>=8&&body.password.length<=256,'Choose a password of at least 8 characters.');check(await matches(body.current,u.password),'Your current password is incorrect.',403);await run('UPDATE users SET password=? WHERE id=?',await hashPassword(body.password),u.id);await run('DELETE FROM sessions WHERE user_id=?',u.id);return json({ok:true},200,cookie('',true,secure));
  }
  if(path.startsWith('/api/members/')){
   const u=await user();check(u.role==='athlete','Athlete access is required.',403);
   if(path==='/api/members/dashboard'&&request.method==='GET')return json({...await athleteRecord(u.id),orders:await all('SELECT ref,items,total,status,created,fulfilment,address FROM orders WHERE user_id=? ORDER BY created DESC',u.id)});
   if(path==='/api/members/profile'&&request.method==='POST'){const name=field(body,'name');check(name.length>=2,'Enter your name.');await run('UPDATE users SET name=? WHERE id=?',name,u.id);await run('UPDATE athlete_profiles SET phone=?,sport=?,position=?,club=?,hometown=?,bio=? WHERE user_id=?',field(body,'phone',40),field(body,'sport',80),field(body,'position',80),field(body,'club',150),field(body,'hometown',150),field(body,'bio',2000),u.id);return json({ok:true});}
   if(path==='/api/members/message'&&request.method==='POST'){check(await one('SELECT 1 FROM athlete_assignments WHERE athlete_id=?',u.id),'Your coach has not been assigned yet. Please contact the academy.');const text=field(body,'message',4000);check(text,'Enter a message.');await run('INSERT INTO athlete_messages(athlete_id,author,body,created) VALUES (?,?,?,?)',u.id,u.name,text,now());return json({ok:true});}
  }
  if(path.startsWith('/api/team/')){
   const u=await staff();
   if(path==='/api/team/data'&&request.method==='GET')return json({viewer:{name:u.name,role:u.role},athletes:await all("SELECT u.id,u.name,u.email,u.created,p.phone,p.sport,p.position,p.club,s.status,s.plan,s.billing,s.amount,a.manager_id,m.name AS manager_name FROM users u LEFT JOIN athlete_profiles p ON p.user_id=u.id LEFT JOIN subscriptions s ON s.user_id=u.id LEFT JOIN athlete_assignments a ON a.athlete_id=u.id LEFT JOIN users m ON m.id=a.manager_id WHERE u.role='athlete'"+(u.role==='coach'?' AND a.manager_id=?':'')+' ORDER BY u.id DESC',...(u.role==='coach'?[u.id]:[])),managers:u.role==='academy_manager'?await all("SELECT id,name,email FROM users WHERE role='coach' ORDER BY name"):[]});
   if(path==='/api/team/create-manager'&&request.method==='POST'){check(u.role==='academy_manager','Manager access is required.',403);const name=field(body,'name'),address=email(body);check(name.length>=2,'Enter the coach name.');check(!await one('SELECT 1 FROM users WHERE email=?',address),'Email already registered.',409);const temporary=random().slice(0,16);await run("INSERT INTO users(name,email,password,verified,created,role) VALUES (?,?,?,1,?,'coach')",name,address,await hashPassword(temporary),now());return json({email:address,password:temporary});}
   const id=request.method==='GET'?Number(url.searchParams.get('id')):body.athlete_id;await requireAthlete(u,id);
   if(path==='/api/team/athlete'&&request.method==='GET')return json(await athleteRecord(id,true));
   check(request.method==='POST','Not found.',404);
   if(path==='/api/team/assign'){check(u.role==='academy_manager','Only managers can assign coaches.',403);const target=body.manager_id;if(target===null)await run('DELETE FROM athlete_assignments WHERE athlete_id=?',id);else{check(Number.isInteger(target)&&await one("SELECT 1 FROM users WHERE id=? AND role='coach'",target),'Choose a coach.');await run('INSERT OR REPLACE INTO athlete_assignments(athlete_id,manager_id) VALUES (?,?)',id,target);}return json({ok:true});}
   if(path==='/api/team/membership'){const status=field(body,'status'),record=await one('SELECT status FROM subscriptions WHERE user_id=?',id);check(record,'The athlete must request a membership first.');check(['pending','active','cancelled'].includes(status),'Choose a valid status.');await run('UPDATE subscriptions SET status=?,notes=?,updated=? WHERE user_id=?',status,field(body,'notes',10000),now(),id);await run('INSERT INTO manager_activity(kind,reference,detail,created) VALUES (?,?,?,?)','memberships',String(id),u.name+': '+record.status+' -> '+status,now());return json({ok:true});}
   if(path==='/api/team/event'){const title=field(body,'title'),kind=field(body,'kind'),venue=field(body,'venue',500),starts=body.starts;check(title.length>=2&&['training','match','meeting'].includes(kind)&&typeof starts==='number'&&starts>0&&starts<4102444800&&venue,'Enter the event title, date, type and venue.');await run("INSERT INTO athlete_events(athlete_id,title,kind,starts,venue,details,status) VALUES (?,?,?,?,?,?,'scheduled')",id,title,kind,starts,venue,field(body,'details',2000));return json({ok:true});}
   if(path==='/api/team/event-status'){const status=field(body,'status');check(['scheduled','completed','cancelled'].includes(status)&&Number.isInteger(body.event_id),'Choose an event and status.');const result=await run('UPDATE athlete_events SET status=? WHERE id=? AND athlete_id=?',status,body.event_id,id);check(result.meta.changes,'Event not found.',404);return json({ok:true});}
   if(path==='/api/team/message'){const text=field(body,'message',4000);check(text,'Enter a message.');await run('INSERT INTO athlete_messages(athlete_id,author,body,created) VALUES (?,?,?,?)',id,u.name,text,now());return json({ok:true});}
  }
  if(path.startsWith('/api/manager/')){
   await manager();
   if(path==='/api/manager/data'&&request.method==='GET')return json({orders:await all('SELECT o.*,u.name,u.email FROM orders o JOIN users u ON o.user_id=u.id ORDER BY o.created DESC'),enquiries:await all('SELECT * FROM contacts ORDER BY created DESC'),memberships:await all('SELECT s.*,u.name,u.email FROM subscriptions s JOIN users u ON s.user_id=u.id ORDER BY COALESCE(s.updated,s.created,0) DESC'),customers:await all("SELECT u.id,u.name,u.email,u.verified,u.created,COUNT(o.ref) AS order_count,COALESCE(SUM(CASE WHEN o.status IN ('paid','shipped','delivered') THEN o.total ELSE 0 END),0) AS paid_total FROM users u LEFT JOIN orders o ON o.user_id=u.id GROUP BY u.id ORDER BY u.id DESC"),newsletter:await all('SELECT email,created FROM newsletter ORDER BY created DESC'),activity:await all('SELECT kind,reference,detail,created FROM manager_activity ORDER BY id DESC LIMIT 100')});
   if(path==='/api/manager/update'&&request.method==='POST'){
    const kinds:Record<string,[string,string,string[]]>={orders:['orders','ref',['pending','paid','shipped','delivered','cancelled']],enquiries:['contacts','id',['new','in_progress','resolved']],memberships:['subscriptions','user_id',['pending','active','cancelled']]};const kind=field(body,'kind'),reference=field(body,'reference'),status=field(body,'status');check(Object.hasOwn(kinds,kind),'Choose a valid record.');const [table,key,allowed]=kinds[kind];check(allowed.includes(status),'Choose a valid status.');const record=await one('SELECT status FROM '+table+' WHERE '+key+'=?',reference);check(record,'Record not found.',404);await run('UPDATE '+table+' SET status=?,notes=?,updated=? WHERE '+key+'=?',status,field(body,'notes',10000),now(),reference);await run('INSERT INTO manager_activity(kind,reference,detail,created) VALUES (?,?,?,?)',kind,reference,'Status: '+record.status+' -> '+status,now());return json({ok:true});
   }
  }
  throw new Problem('Not found.',404);
 }catch(error){if(error instanceof Problem)return json({error:error.message},error.status);console.error('RaiseSport request failed',error);return json({error:'Unable to complete this request. Please try again.'},500);}
}
