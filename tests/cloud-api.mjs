import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

const root=path.resolve(import.meta.dirname,'..');
const output=path.join(root,'outputs','api-test');fs.mkdirSync(output,{recursive:true});
for(const name of ['website-pages','raisesport-server']){
 const source=fs.readFileSync(path.join(root,'app',name+'.ts'),'utf8').replace("'./website-pages'","'./website-pages.mjs'");
 const result=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true});
 assert.equal((result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
 fs.writeFileSync(path.join(output,name+'.mjs'),result.outputText);
}
const {application}=await import(new URL('../outputs/api-test/raisesport-server.mjs',import.meta.url));
const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync(path.join(root,'tests','cloud-schema.sql'),'utf8'));
class Statement{
 constructor(sql,values=[]){this.sql=sql;this.values=values;}
 bind(...values){return new Statement(this.sql,values);}
 async first(){return sqlite.prepare(this.sql).get(...this.values)||null;}
 async all(){return {results:sqlite.prepare(this.sql).all(...this.values)};}
 async run(){const result=sqlite.prepare(this.sql).run(...this.values);return {success:true,meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};}
}
const DB={prepare:sql=>new Statement(sql),async batch(statements){sqlite.exec('BEGIN');try{const rows=[];for(const s of statements)rows.push(await s.run());sqlite.exec('COMMIT');return rows;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
const env={DB,RAISESPORT_DEMO_MODE:'true'};
const cookies=new Map();
async function call(route,body,as='',extra={}){
 const request=new Request('https://raisesport.test'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(cookies.get(as)?{Cookie:cookies.get(as)}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});
 const response=await application(request,env);if(response.headers.has('Set-Cookie'))cookies.set(as,response.headers.get('Set-Cookie').split(';')[0]);
 const content=await response.text();let result;try{result=JSON.parse(content);}catch{result=content;}return {status:response.status,body:result,headers:response.headers};
}
assert.equal((await call('/')).status,200);
assert.equal((await call('/manager/')).status,303);
assert.equal((await call('/api/health')).body.service,'raisesport-cloud');
for(const [name,email,role,home] of [['athlete','athlete@gmail.com','athlete','/athlete/'],['coach','coach@gmail.com','coach','/coach/'],['manager','manager@gmail.com','academy_manager','/manager/']]){
 const signed=await call('/api/auth/login',{email,password:'password'},name);assert.equal(signed.status,200,JSON.stringify(signed.body));assert.equal(signed.body.role,role);assert(signed.headers.get('Set-Cookie').includes('Secure'));assert(signed.headers.get('Set-Cookie').includes('HttpOnly'));assert.equal((await call(home,undefined,name)).status,200);
}
assert.equal((await call('/api/manager/data',undefined,'athlete')).status,403);
assert.equal((await call('/api/manager/data',undefined,'coach')).status,403);
assert.equal((await call('/api/members/dashboard',undefined,'manager')).status,403);
assert.equal((await call('/coach/',undefined,'athlete')).headers.get('Location'),'/athlete/');
assert.equal((await call('/api/auth/signup',{name:'Bad Role',email:'bad@example.com',password:'password',role:'coach'})).status,403);
const registered=await call('/api/auth/signup',{name:'New Athlete',email:'new@example.com',password:'password',phone:'0820000000',billing:'annual'},'new');assert.equal(registered.status,200,JSON.stringify(registered.body));
let athlete=(await call('/api/members/dashboard',undefined,'new')).body;const id=athlete.user.id;assert.equal(athlete.subscription.amount,1440);assert.equal(athlete.subscription.status,'pending');
assert.equal((await call('/api/team/athlete?id='+id,undefined,'coach')).status,403);
const roster=(await call('/api/team/data',undefined,'manager')).body;const coachId=roster.managers[0].id;
assert.equal((await call('/api/team/assign',{athlete_id:id,manager_id:coachId},'coach')).status,403);
assert.equal((await call('/api/team/assign',{athlete_id:id,manager_id:coachId},'manager')).status,200);
assert.equal((await call('/api/team/membership',{athlete_id:id,status:'active',notes:'PRIVATE NOTE'},'coach')).status,200);
assert.equal((await call('/api/members/profile',{name:'Updated Athlete',phone:'0821110000',sport:'Football',position:'Goalkeeper',club:'Academy',hometown:'Durban',bio:'Training'},'new')).status,200);
assert.equal((await call('/api/team/event',{athlete_id:id,title:'Training','kind':'training',starts:Date.now()/1000+86400,venue:'Training pitch',details:'Bring boots'},'coach')).status,200);
assert.equal((await call('/api/team/message',{athlete_id:id,message:'Welcome to the team'},'coach')).status,200);
assert.equal((await call('/api/members/message',{message:'Thank you'},'new')).status,200);
athlete=(await call('/api/members/dashboard',undefined,'new')).body;assert.equal(athlete.subscription.status,'active');assert(!('notes' in athlete.subscription));assert.equal(athlete.profile.position,'Goalkeeper');assert.equal(athlete.events.length,1);assert.equal(athlete.messages.length,2);
assert.equal((await call('/api/orders',{items:[{name:'Hoodie',qty:2}],fulfilment:'delivery'},'new')).status,400);
const order=await call('/api/orders',{items:[{name:'Hoodie',qty:2,price:1}],name:'Order Contact',phone:'0821110000',fulfilment:'delivery',address:'123 Durban',customer_notes:'Call first'},'new');assert.equal(order.status,200,JSON.stringify(order.body));assert.equal(order.body.total,798);
assert.equal((await call('/api/contact',{name:'Enquiry sender',email:'sender@example.com',subject:'Membership',message:'Please send details',phone:'0820000000'})).status,200);
assert.equal((await call('/api/newsletter',{email:'subscriber@example.com'})).status,200);
const manager=(await call('/api/manager/data',undefined,'manager')).body;assert.equal(manager.orders.length,1);assert.equal(manager.orders[0].customer_name,'Order Contact');assert.equal(manager.enquiries.length,1);assert.equal(manager.newsletter.length,1);assert(!('password' in manager.customers[0]));
assert.equal((await call('/api/manager/update',{kind:'orders',reference:order.body.ref,status:'paid',notes:'Receipt checked'},'manager')).status,200);
assert.equal((await call('/api/manager/update',{kind:'orders',reference:order.body.ref,status:'paid'},'coach')).status,403);
assert.equal((await call('/api/members/message',{message:'CSRF'},'new',{Origin:'https://evil.example'})).status,403);
assert.equal((await call('/api/payfast/checkout',{},'new')).status,503);
const signedInfo=(await call('/api/auth/me',undefined,'new')).body.session;await call('/api/auth/activity',{},'new');assert.equal((await call('/api/auth/me',undefined,'new')).body.session.absoluteExpires,signedInfo.absoluteExpires);
sqlite.prepare('UPDATE sessions SET last_seen=? WHERE user_id=?').run(Date.now()/1000-901,id);assert.equal((await call('/api/members/dashboard',undefined,'new')).status,401);
assert.equal((await call('/api/auth/logout',{},'manager')).status,200);assert.equal((await call('/api/manager/data',undefined,'manager')).status,401);
sqlite.close();console.log('PASS: hosted login roles, protected pages, coach assignment, memberships, profile, schedules, messages, orders, enquiries, newsletter, CSRF, idle expiry and logout.');
