'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(n||0);
const date=n=>n?new Intl.DateTimeFormat('en-ZA',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Johannesburg'}).format(new Date(n*1000)):'Not recorded';
const label=s=>String(s||'pending').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
const badge=s=>'<span class="badge '+esc(s||'pending')+'">'+esc(label(s))+'</span>';
const titles={overview:'Overview',membership:'Membership',profile:'My profile',schedule:'My schedule',messages:'Messages',orders:'Shop orders',password:'Password'};
let record=null,view='overview',busy=false;
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),3500);}
function signOut(){Auth.hidePrivate();location.replace('/login/');}
async function api(path,body){try{return await Auth.api('/api/'+path,body);}catch(error){if(error.status===401||error.status===403)signOut();throw error;}}
async function load(){
 const user=await Auth.requireRole(['athlete']);if(!user)return;
 $('memberRefresh').disabled=true;
 try{record=await api('members/dashboard');$('memberApp').hidden=false;$('memberError').textContent='';$('sidebarName').textContent=record.user.name;$('memberInitials').textContent=record.user.name.slice(0,2).toUpperCase();render();}
 catch(error){$('memberError').textContent=error.message;}
 finally{$('memberRefresh').disabled=false;}
}
const payments=()=>'<div class="coming-soon"><strong>PayFast · Coming soon</strong><strong>Bank transfer · Coming soon</strong><span>Payment collection is not available yet. Your membership status is managed by the academy.</span></div>';
const empty=text=>'<p class="empty-pad">'+text+'</p>';
function events(rows){return rows.length?rows.map(e=>'<div class="event"><div class="event-time">'+esc(label(e.kind))+'</div><div class="event-main"><h3>'+esc(e.title)+'</h3><p>'+date(e.starts)+'<br>'+esc(e.venue)+'</p>'+(e.details?'<p>'+esc(e.details)+'</p>':'')+'</div>'+badge(e.status)+'</div>').join(''):empty('No events have been scheduled yet. Your manager will add training sessions and fixtures here.');}
function messages(){return record.messages.length?record.messages.map(m=>'<article class="message"><div class="message-header"><strong>'+esc(m.author)+'</strong><span>'+date(m.created)+'</span></div><p>'+esc(m.body)+'</p></article>').join(''):empty('No messages yet. Your conversation with the academy will appear here.');}
function setView(next){view=next;render();window.scrollTo(0,0);}
function render(){
  if(!record)return;
  const s=record.subscription,p=record.profile;
  $('memberBreadcrumb').textContent=titles[view];$('memberTitle').textContent=view==='overview'?'Welcome back, '+record.user.name.split(' ')[0]+'.':titles[view];
  $('memberSubtitle').textContent=view==='overview'?'Your academy, your progress, your next step.':'Manage your '+titles[view].toLowerCase()+' with RaiseSport.';
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view===view));
  let html='';
  if(view==='overview'){
    const upcoming=record.events.filter(e=>e.starts>=Date.now()/1000&&e.status==='scheduled');
    const stat=(title,value,note)=>'<div class="stat"><div class="stat-label">'+title+'</div><strong>'+value+'</strong><small>'+note+'</small></div>';
    html='<div class="member-hero"><div><h2>'+esc(s?s.plan:'Your membership journey')+'</h2><p>Member RS-A'+String(record.user.id).padStart(4,'0')+' · '+(s?esc(label(s.billing))+' billing':'Choose a membership to get started')+'</p></div>'+badge(s?s.status:'pending')+'</div><div class="stats">'+stat('Membership',esc(s?label(s.status):'Not requested'),'Academy approval status')+stat('Upcoming events',upcoming.length,'Training, fixtures and meetings')+stat('Shop orders',record.orders.length,'Your saved shop orders')+stat('Your sport',esc(p.sport||'Add sport'),'Update your athlete profile')+'</div><div class="member-grid"><section class="panel"><div class="panel-heading"><h3>Your next sessions</h3><button class="text-button" data-go="schedule">View schedule →</button></div>'+events(upcoming.slice(0,3))+'</section><section class="panel padded"><h2>Your coach</h2>'+(record.manager?'<p><strong>'+esc(record.manager.name)+'</strong></p><p class="member-help">'+esc(record.manager.email)+'</p><button class="secondary" data-go="messages">Open messages →</button>':'<p class="member-help">The academy will assign your coach. Your account and membership request are saved.</p><a href="/#contact" class="text-button">Contact the academy →</a>')+payments()+'</section></div>';
  }
  if(view==='membership'){
    html='<div class="member-grid"><section class="panel padded"><h2>'+esc(s?s.plan:'Starter Athlete')+'</h2>'+badge(s?s.status:'pending')+'<dl class="member-facts"><div><dt>Membership number</dt><dd>RS-A'+String(record.user.id).padStart(4,'0')+'</dd></div><div><dt>Billing</dt><dd>'+esc(s?label(s.billing):'Choose below')+'</dd></div><div><dt>Membership amount</dt><dd>'+money(s?s.amount:150)+'</dd></div><div><dt>Requested</dt><dd>'+date(s?s.created:null)+'</dd></div></dl><p class="member-help">'+(s&&s.status==='active'?'Your membership is active. Contact your manager to request a plan change.':'Your account is ready. Membership requests remain pending until the academy reviews and activates them.')+'</p>'+(s&&s.status==='active'?'':'<form id="membershipForm" class="member-form"><label for="billing">Billing period</label><select id="billing" name="billing"><option value="monthly" '+(s?.billing==='monthly'?'selected':'')+'>Monthly · R150</option><option value="annual" '+(s?.billing==='annual'?'selected':'')+'>Annual · R1,440</option></select><button class="primary">'+(s&&s.status==='pending'?'Update membership request':'Request membership')+'</button></form>')+'</section><section class="panel padded"><h2>Membership payments</h2><p class="member-help">These payment options will be available soon. No payment is taken now.</p>'+payments()+'</section></div>';
  }
  if(view==='profile'){
    const input=(key,title,value,max=150)=>'<div><label for="profile-'+key+'">'+title+'</label><input id="profile-'+key+'" name="'+key+'" value="'+esc(value)+'" maxlength="'+max+'" '+(key==='name'?'required minlength="2"':'')+'></div>';
    html='<section class="panel padded"><h2>Your athlete profile</h2><p class="member-help">Your assigned manager can see these details.</p><form id="profileForm" class="member-form"><div class="form-pair">'+input('name','Full name',record.user.name,200)+input('phone','Phone number',p.phone,40)+input('sport','Sport',p.sport,80)+input('position','Playing position / discipline',p.position,80)+input('club','Club or team',p.club)+input('hometown','Hometown',p.hometown)+'</div><label for="profile-bio">About you and your goals</label><textarea id="profile-bio" name="bio" rows="4" maxlength="2000">'+esc(p.bio)+'</textarea><p class="hint">Account email: '+esc(record.user.email)+'</p><button class="primary">Save profile</button></form></section>';
  }
  if(view==='schedule')html='<section class="panel"><div class="panel-heading"><h3>Your training, fixtures and meetings</h3></div>'+events(record.events)+'</section>';
  if(view==='messages')html='<section class="panel padded"><h2>Messages with your academy</h2>'+messages()+(record.manager?'<form id="messageForm" class="member-form"><label for="messageText">Message your manager</label><textarea id="messageText" name="message" required maxlength="4000" rows="3" placeholder="Ask a question or share an update"></textarea><button class="primary">Send message</button></form>':'<p class="member-help">Messaging will be available when a manager is assigned. <a href="/#contact">Contact the academy</a> in the meantime.</p>')+'</section>';
  if(view==='orders')html='<section class="panel"><div class="panel-heading"><h3>Your shop orders</h3><a class="text-button" href="/#shop">Visit shop →</a></div><div class="table-scroll"><table><thead><tr><th>Order</th><th>Products</th><th>Total</th><th>Date</th><th>Status</th></tr></thead><tbody>'+record.orders.map(o=>'<tr><td>'+esc(o.ref)+'</td><td>'+esc(o.items)+'</td><td>'+money(o.total)+'</td><td>'+date(o.created)+'</td><td>'+badge(o.status)+'</td></tr>').join('')+'</tbody></table></div>'+(!record.orders.length?empty('No orders yet. Browse the shop when you are ready.'):'')+'</section>';
  if(view==='password')html='<section class="panel padded password-panel"><h2>Change your password</h2><form id="memberPasswordForm" class="member-form"><label for="currentPassword">Current password</label><input id="currentPassword" name="current" type="password" autocomplete="current-password" required maxlength="256"><label for="newPassword">New password</label><input id="newPassword" name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="256"><p class="hint">You will be signed out after changing your password.</p><button class="primary">Update password</button></form></section>';
  $('memberView').innerHTML=html;
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-view],[data-go]');if(b)setView(b.dataset.view||b.dataset.go);});
$('memberView').addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;busy=true;const button=e.target.querySelector('button[type="submit"],button.primary');button.disabled=true;$('memberError').textContent='';
  const body=Object.fromEntries(new FormData(e.target));
  const paths={profileForm:'members/profile',messageForm:'members/message',membershipForm:'subscriptions',memberPasswordForm:'members/password'};
  if(e.target.id==='membershipForm')body.plan='Starter Athlete';
  try{await api(paths[e.target.id],body);if(e.target.id==='memberPasswordForm'){Auth.notify();signOut();}else{await load();toast('Saved successfully.');}}
  catch(error){$('memberError').textContent=error.message;}
  finally{busy=false;button.disabled=false;}
});
$('memberRefresh').addEventListener('click',load);
$('memberLogout').addEventListener('click',()=>Auth.logout().catch(error=>{$('memberError').textContent=error.message;}));
const initialView=new URLSearchParams(location.search).get('view');if(initialView in titles)view=initialView;
load();
