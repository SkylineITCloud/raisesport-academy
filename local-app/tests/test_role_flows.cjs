// End-to-end tests. Requires Playwright and installed Microsoft Edge.
const {chromium}=require('playwright');
const {spawn,spawnSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),storage=fs.mkdtempSync(path.join(os.tmpdir(),'raisesport-roles-'));
const port=19389,base='http://127.0.0.1:'+port;
const env={...process.env,RAISESPORT_DATA:storage,RAISESPORT_PORT:String(port),PYTHONPATH:path.join(root,'backend')};
const seed=spawnSync('python',['backend/create_accounts.py','--reset-requested'],{cwd:root,env,encoding:'utf8'});
if(seed.status!==0)throw new Error(seed.stderr);
const server=spawn('python',['run.py','--no-browser'],{cwd:root,env,stdio:'ignore',windowsHide:true});
let browser;
(async()=>{
 try{
  for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,channel:'msedge'});
  const errors=[];const output=path.join(root,'tests','screenshots');fs.mkdirSync(output,{recursive:true});
  async function page(context){const p=context?await context.newPage():await browser.newPage({viewport:{width:1440,height:1000}});p.on('pageerror',e=>errors.push(e.message));return p;}
  async function login(p,email,home){await p.goto(base+'/login/');await p.locator('#memberEmail').fill(email);await p.locator('#memberPassword').fill('password');await p.locator('#authSubmit').click();await p.waitForURL(base+home);await p.locator('[data-private]').first().waitFor({state:'visible'});}
  async function save(p,selector){await Promise.all([p.waitForResponse(r=>r.url().includes('/api/team/athlete?')&&r.status()===200),p.locator(selector).click()]);}
  const athlete=await page(),coach=await page(),manager=await page();
  await login(athlete,'athlete@gmail.com','/athlete/');await login(coach,'coach@gmail.com','/coach/');await login(manager,'manager@gmail.com','/manager/');
  for(const [p,home,forbidden] of [[athlete,'/athlete/',['/manager/','/coach/','/team/']],[coach,'/coach/',['/manager/','/athlete/','/team/']],[manager,'/manager/',['/athlete/','/coach/']]]){
   for(const dest of forbidden){await p.goto(base+dest);assert.equal(new URL(p.url()).pathname,home);}
  }
  assert.equal((await athlete.request.get(base+'/api/manager/data')).status(),403);
  assert.equal((await coach.request.get(base+'/api/manager/data')).status(),403);
  assert.equal((await manager.request.get(base+'/api/members/dashboard')).status(),403);
  await athlete.locator('[data-view="profile"]').click();await athlete.locator('#profile-position').fill('Goalkeeper');await athlete.locator('#profile-club').fill('Development team');await athlete.getByRole('button',{name:'Save profile'}).click();await athlete.getByText('Saved successfully.',{exact:true}).waitFor();
  // Checkout retains the public cart, while identity comes only from the cookie.
  await athlete.goto(base+'/#shop');for(let i=0;i<3;i++)await athlete.getByRole('button',{name:'Add to Cart',exact:true}).nth(i).click();await athlete.locator('#cartBtn').click();
  await athlete.setViewportSize({width:390,height:844});assert((await athlete.locator('#cartItems').boundingBox()).height>450);assert.equal(await athlete.locator('#cartDrawer input').count(),0);await athlete.screenshot({path:path.join(output,'cart-mobile.png')});await athlete.locator('#checkoutBtn').click();await athlete.waitForURL(base+'/checkout/');await athlete.locator('#checkoutForm').waitFor({state:'visible'});await athlete.locator('#orderPhone').fill('0821234567');await athlete.locator('#orderFulfilment').selectOption('delivery');await athlete.locator('#orderAddress').fill('123 Test Street, Durban, 4001');await athlete.locator('#orderNotes').fill('Call before delivery.');await athlete.locator('#placeOrder').click();await athlete.getByRole('heading',{name:'Your order is saved.'}).waitFor();
  await manager.locator('[data-view="orders"]').click();await manager.getByRole('button',{name:'View details'}).first().click();await manager.getByText('123 Test Street, Durban, 4001',{exact:true}).last().waitFor();await manager.locator('#closeDetail').click();
  // Registration is athlete-only and starts pending; manager assigns a coach.
  const newcomer=await page();await newcomer.goto(base+'/');await newcomer.locator('#navJoin').click();await newcomer.waitForURL('**/login/?mode=register&billing=monthly');await newcomer.locator('#memberName').fill('New Athlete');await newcomer.locator('#memberPhone').fill('0821112233');await newcomer.locator('#memberEmail').fill('newplayer@example.com');await newcomer.locator('#memberPassword').fill('password');await newcomer.locator('#confirmPassword').fill('wrong');await newcomer.locator('#authSubmit').click();await newcomer.getByText('Passwords do not match.',{exact:true}).waitFor();await newcomer.locator('#confirmPassword').fill('password');await newcomer.locator('#memberBilling').selectOption('annual');await newcomer.locator('#authSubmit').click();await newcomer.waitForURL(base+'/athlete/');await newcomer.locator('[data-view="membership"]').click();await newcomer.getByText('Annual',{exact:true}).waitFor();
  assert.equal((await newcomer.request.get(base+'/api/team/data')).status(),403);
  await coach.locator('#teamRefresh').click();await coach.getByRole('row').filter({hasText:'athlete@gmail.com'}).waitFor();assert.equal(await coach.getByRole('row').filter({hasText:'newplayer@example.com'}).count(),0);
  await manager.locator('#athleteManagementBtn').click();await manager.waitForURL(base+'/team/');await manager.getByRole('row').filter({hasText:'newplayer@example.com'}).getByRole('button',{name:'Manage athlete'}).click();await manager.locator('#assignManager').selectOption({label:'Coach · coach@gmail.com'});await save(manager,'#assignmentForm button');
  await coach.locator('#teamRefresh').click();await coach.getByRole('row').filter({hasText:'newplayer@example.com'}).getByRole('button',{name:'Manage athlete'}).click();await coach.locator('#athleteStatus').selectOption('active');await coach.locator('#membershipNotes').fill('PRIVATE COACH NOTE');await save(coach,'#statusForm button');await coach.locator('#eventTitle').fill('Goalkeeper training');await coach.locator('#eventStarts').fill('2026-10-30T16:00');await coach.locator('#eventVenue').fill('Academy training pitch');await save(coach,'#eventForm button');await coach.locator('#staffMessage').fill('Your first training session is scheduled.');await save(coach,'#staffMessageForm button');
  await newcomer.locator('#memberRefresh').click();await newcomer.locator('[data-view="overview"]').click();await newcomer.getByRole('heading',{name:'Goalkeeper training'}).waitFor();assert(!(await newcomer.locator('body').textContent()).includes('PRIVATE COACH NOTE'));await newcomer.screenshot({path:path.join(output,'athlete-desktop.png'),fullPage:true});await newcomer.locator('[data-view="messages"]').click();await newcomer.getByText('Your first training session is scheduled.',{exact:true}).waitFor();await newcomer.locator('#messageText').fill('Thank you, coach.');await newcomer.getByRole('button',{name:'Send message',exact:true}).click();await newcomer.getByText('Thank you, coach.',{exact:true}).waitFor();
  await newcomer.setViewportSize({width:390,height:844});await newcomer.locator('[data-view="overview"]').click();assert(await newcomer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await newcomer.screenshot({path:path.join(output,'athlete-mobile.png'),fullPage:true});await coach.locator('#rosterNav').click();await coach.screenshot({path:path.join(output,'coach-desktop.png'),fullPage:true});
  // Logging out clears every tab. Old admin tokens in storage never restore access.
  const context=await browser.newContext({viewport:{width:1280,height:720}});const tab1=await page(context);await login(tab1,'manager@gmail.com','/manager/');const tab2=await page(context);await tab2.goto(base+'/manager/');await tab2.locator('#app').waitFor({state:'visible'});await tab1.locator('#logoutBtn').click();await tab1.waitForURL(base+'/login/');await tab2.waitForURL(base+'/login/');assert.equal((await tab2.request.get(base+'/api/manager/data')).status(),401);
  await tab1.evaluate(()=>{sessionStorage.setItem('rs_manager_token','fake-admin');localStorage.setItem('rs_role','academy_manager');});await login(tab1,'athlete@gmail.com','/athlete/');await tab2.waitForURL(base+'/athlete/');await tab2.goto(base+'/manager/');assert.equal(new URL(tab2.url()).pathname,'/athlete/');assert.equal((await tab2.request.get(base+'/api/manager/data')).status(),403);
  const cookie=(await context.cookies()).find(c=>c.name==='rs_session');assert(cookie.httpOnly);assert.equal(cookie.sameSite,'Strict');assert.equal(await tab1.evaluate(()=>sessionStorage.getItem('rs_manager_token')),null);
  await tab1.locator('#memberLogout').click();await tab1.waitForURL(base+'/login/');await tab1.goBack({waitUntil:'domcontentloaded'});assert.equal(await tab1.locator('[data-private]:visible').count(),0);assert.equal((await tab1.request.get(base+'/api/auth/me')).status(),401);
  // Exercise the idle sign-out UI quickly; backend timeout enforcement has its own tests.
  const idlePage=await page();
  await idlePage.route('**/api/auth/me',async route=>{const response=await route.fetch();const body=await response.json();if(body.session)body.session.idleExpires=Date.now()/1000+1;await route.fulfill({response,json:body});});
  await login(idlePage,'coach@gmail.com','/coach/');
  await idlePage.waitForURL(base+'/login/?expired=1',{timeout:15000});
  await idlePage.getByText('Your session expired. Please sign in again.',{exact:true}).waitFor();
  assert.equal((await idlePage.request.get(base+'/api/team/data')).status(),401);
  assert.deepEqual(errors,[]);
  console.log('PASS: all three password logins, role-only pages, blocked APIs, assigned athletes, registration, checkout, membership approval, messages, schedules, private notes, mobile layout, cross-tab logout/account switching and browser-back access.');
 }finally{if(browser)await browser.close();server.kill();await new Promise(r=>server.once('exit',r));fs.rmSync(storage,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
