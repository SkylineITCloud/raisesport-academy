'use strict';
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money = value => new Intl.NumberFormat('en-ZA', {style:'currency',currency:'ZAR',maximumFractionDigits:2}).format(Number(value || 0));
const date = value => value ? new Intl.DateTimeFormat('en-ZA',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Johannesburg'}).format(new Date(value * 1000)) : 'Not recorded';
const label = value => String(value || '').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
const statuses = {orders:['pending','paid','shipped','delivered','cancelled'],enquiries:['new','in_progress','resolved'],memberships:['pending','active','cancelled']};
const titles = {overview:'Overview',enquiries:'Enquiries',orders:'Orders',memberships:'Memberships',customers:'Customers',newsletter:'Newsletter',activity:'Activity'};
const descriptions = {enquiries:'Every message, with the details you need to follow up.',orders:'See who ordered what, when, and where it needs to go.',memberships:'Review requests and manage academy memberships.',customers:'Your registered customers and their order history.',newsletter:'People who asked to hear from RaiseSport.',activity:'A record of status changes and manager updates.'};
const paid = row => ['paid','shipped','delivered'].includes(row.status);

let data = {orders:[],enquiries:[],memberships:[],customers:[],newsletter:[],activity:[]};
let view = 'overview', currentDetail = null, loading = false;

async function api(path,body){try{return await Auth.api('/api/manager/'+path,body);}catch(error){if(error.status===401||error.status===403)signOut();throw error;}}
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(()=>$('toast').classList.remove('show'),3500);
}
function signOut(){Auth.hidePrivate();location.replace('/login/');}
async function refresh() {
  if (loading) return;
  loading = true;
  $('refreshBtn').disabled = true;
  try {
    data = await api('data');
    $('app').hidden = false;
    $('globalError').hidden = true;
    $('lastUpdated').textContent = 'Updated '+date(Date.now()/1000);
    $('newCount').textContent = data.enquiries.filter(e=>e.status==='new').length || '';
    render();
  } catch (error) {
    $('globalError').textContent = error.message;
    $('globalError').hidden = false;
  } finally {
    loading = false;
    $('refreshBtn').disabled = false;
  }
}
function setView(next) {
  view = next;
  $('search').value = '';
  $('statusFilter').innerHTML = '<option value="">All statuses</option>'+(statuses[view]||[]).map(s=>'<option value="'+s+'">'+label(s)+'</option>').join('');
  $('statusFilter').hidden = !statuses[view];
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view===view));
  render();
}
function badge(status) { return '<span class="badge '+escapeHTML(status)+'">'+escapeHTML(label(status))+'</span>'; }
function empty(text) { return '<div class="empty"><strong>All clear for now.</strong>'+escapeHTML(text)+'</div>'; }
function openButton(kind,ref,text='View details') { return '<button class="text-button" data-kind="'+kind+'" data-ref="'+escapeHTML(ref)+'">'+text+' →</button>'; }
function reference(kind,row) { return kind==='orders'?row.ref:kind==='memberships'?String(row.user_id):String(row.id); }
function overview() {
  const newEnquiries = data.enquiries.filter(e=>e.status==='new').length;
  const pendingOrders = data.orders.filter(o=>o.status==='pending').length;
  const revenue = data.orders.filter(paid).reduce((sum,o)=>sum+o.total,0);
  const active = data.memberships.filter(s=>s.status==='active').length;
  const stat = (name,value,note,emphasis=false) => '<div class="stat '+(emphasis?'emphasis':'')+'"><div class="stat-label">'+name+'<span>↗</span></div><strong>'+value+'</strong><small>'+note+'</small></div>';
  const recentOrders = data.orders.slice(0,5).map(o=>'<button class="list-row" data-kind="orders" data-ref="'+escapeHTML(o.ref)+'"><span class="avatar">'+escapeHTML(o.name.slice(0,2).toUpperCase())+'</span><span class="list-main"><strong>'+escapeHTML(o.name)+'</strong><small>'+escapeHTML(o.ref)+' · '+escapeHTML(o.items)+'</small></span><span class="list-right">'+money(o.total)+'<small>'+label(o.status)+'</small></span></button>').join('');
  const recentEnquiries = data.enquiries.filter(e=>e.status!=='resolved').slice(0,5).map(e=>'<button class="list-row" data-kind="enquiries" data-ref="'+e.id+'"><span class="avatar">'+escapeHTML(e.name.slice(0,2).toUpperCase())+'</span><span class="list-main"><strong>'+escapeHTML(e.subject||'General enquiry')+'</strong><small>'+escapeHTML(e.name)+' · '+escapeHTML(date(e.created))+'</small></span>'+badge(e.status)+'</button>').join('');
  $('overview').innerHTML = '<div class="stats">'+stat('Confirmed order value',money(revenue),'Paid, shipped and delivered orders',true)+stat('New enquiries',newEnquiries,'Waiting for your first follow-up')+stat('Pending orders',pendingOrders,'Awaiting payment confirmation')+stat('Active memberships',active,data.customers.length+' registered customers')+'</div><div class="overview-grid"><section class="panel"><div class="panel-heading"><h3>Recent orders</h3><button class="text-button" data-go="orders">All orders →</button></div>'+(recentOrders||empty('Orders placed on the website will appear here.'))+'</section><section class="panel"><div class="panel-heading"><h3>Enquiries to follow up</h3><button class="text-button" data-go="enquiries">All enquiries →</button></div>'+(recentEnquiries||empty('New contact form messages will appear here.'))+'</section></div><div class="overview-note"><strong>A clear view of what needs your attention.</strong>Open any record to see customer details, update its status and keep private follow-up notes. Payment statuses are updated manually after you confirm the money was received.</div>';
}
function filteredRows() {
  const query = $('search').value.trim().toLowerCase();
  const status = $('statusFilter').value;
  return data[view].filter(row=>(!status||row.status===status)&&(!query||Object.values(row).some(value=>String(value??'').toLowerCase().includes(query))));
}
function render() {
  $('breadcrumb').textContent = titles[view];
  $('pageTitle').textContent = view==='overview'?'Good to see you, Manager.':titles[view];
  $('pageDescription').textContent = view==='overview'?'Here’s what’s happening across your academy.':descriptions[view];
  $('overview').hidden = view!=='overview';
  $('records').hidden = view==='overview';
  if (view==='overview') return overview();
  const rows = filteredRows();
  $('tableTitle').textContent = titles[view];
  $('recordCount').textContent = rows.length+' of '+data[view].length+' records';
  let headers;
  if (view==='orders') headers=['Order / customer','Items','Total','Delivery / collection','Ordered','Status',''];
  if (view==='enquiries') headers=['Sender','Enquiry','Received','Status',''];
  if (view==='memberships') headers=['Member','Plan','Billing','Amount','Requested','Status',''];
  if (view==='customers') headers=['Customer','Joined','Orders','Confirmed order value','Account',''];
  if (view==='newsletter') headers=['Email address','Subscribed'];
  if (view==='activity') headers=['When','Record type','Reference','Update'];
  $('tableHead').innerHTML = '<tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr>';
  const person = r=>'<strong>'+escapeHTML(r.name)+'</strong><small>'+escapeHTML(r.email)+'</small>';
  $('tableBody').innerHTML = rows.map(r=>{
    let cells;
    if (view==='orders') cells=['<strong>'+escapeHTML(r.ref)+'</strong><small>'+escapeHTML(r.name)+' · '+escapeHTML(r.email)+'</small>','<span class="record-summary">'+escapeHTML(r.items)+'</span>',money(r.total),'<strong>'+label(r.fulfilment)+'</strong><small class="record-summary">'+escapeHTML(r.address||'No delivery address needed')+'</small>',date(r.created),badge(r.status),openButton(view,r.ref)];
    if (view==='enquiries') cells=[person(r),'<div class="record-summary"><strong>'+escapeHTML(r.subject)+'</strong><small class="truncate">'+escapeHTML(r.message)+'</small></div>',date(r.created),badge(r.status),openButton(view,r.id)];
    if (view==='memberships') cells=[person(r),escapeHTML(r.plan),label(r.billing),money(r.amount),date(r.created),badge(r.status),openButton(view,r.user_id)];
    if (view==='customers') cells=[person(r),date(r.created),r.order_count,money(r.paid_total),r.verified?'Confirmed':'Unconfirmed',openButton(view,r.id,'Customer history')];
    if (view==='newsletter') cells=[escapeHTML(r.email),date(r.created)];
    if (view==='activity') cells=[date(r.created),escapeHTML(label(r.kind)),escapeHTML(r.reference),escapeHTML(r.detail)];
    return '<tr>'+cells.map(c=>'<td>'+c+'</td>').join('')+'</tr>';
  }).join('') || '<tr><td colspan="'+headers.length+'">'+empty($('search').value||$('statusFilter').value?'No records match your filters.':'Records will appear here when people use your website.')+'</td></tr>';
}
function detailField(name,value,wide=false) { return '<div class="'+(wide?'detail-wide':'')+'"><small>'+name+'</small><p>'+escapeHTML(value)+'</p></div>'; }
function openDetail(kind,ref) {
  const row = data[kind].find(r=>reference(kind,r)===String(ref));
  if (!row) return;
  currentDetail = {kind,ref:String(ref),row};
  $('detailType').textContent = titles[kind];
  $('detailTitle').textContent = kind==='orders'?row.ref:row.name;
  $('detailError').textContent = '';
  $('editFields').hidden = kind==='customers';
  $('saveDetail').hidden = kind==='customers';
  $('saveHint').textContent = kind==='orders'?'Confirm payment receipt before marking an order paid.':'';
  let content = '<div class="detail-grid">'+detailField('Name',row.name)+detailField('Email',row.email);
  if (kind==='orders') {
    content += detailField('Order contact name',row.customer_name||row.name)+detailField('Customer instructions',row.customer_notes||'None');
    content += detailField('Ordered',date(row.created))+detailField('Total',money(row.total))+detailField('Phone',row.phone||'Not provided')+detailField('Fulfilment',label(row.fulfilment))+detailField('Delivery address',row.address||(row.fulfilment==='delivery'?'Not recorded':'Collection - arrange with customer'),true)+detailField('Last manager update',date(row.updated),true)+'</div><div class="message-box">'+escapeHTML(row.items)+'</div>';
    let lines=[];
    try { lines=JSON.parse(row.lines); } catch (_) {}
    if (lines.length) content += '<div class="table-scroll"><table><thead><tr><th>Product</th><th>Qty</th><th>Each</th><th>Total</th></tr></thead><tbody>'+lines.map(l=>'<tr><td>'+escapeHTML(l.name)+'</td><td>'+escapeHTML(l.qty)+'</td><td>'+money(l.unit_price)+'</td><td>'+money(l.unit_price*l.qty)+'</td></tr>').join('')+'</tbody></table></div>';
  }
  if (kind==='enquiries') content += detailField('Phone',row.phone||'Not provided')+detailField('Received',date(row.created))+detailField('Subject',row.subject,true)+'</div><div class="message-box">'+escapeHTML(row.message)+'</div>';
  if (kind==='memberships') content += detailField('Plan',row.plan)+detailField('Billing',label(row.billing))+detailField('Amount',money(row.amount))+detailField('Requested',date(row.created))+'</div>';
  if (kind==='customers') {
    const orders=data.orders.filter(o=>o.user_id===row.id);
    const messages=data.enquiries.filter(e=>e.email===row.email);
    const membership=data.memberships.find(s=>s.user_id===row.id);
    content += detailField('Joined',date(row.created))+detailField('Confirmed order value',money(row.paid_total))+'</div>';
    content += '<h3>Orders ('+orders.length+')</h3>'+ (orders.map(o=>'<div class="list-row"><span class="list-main"><strong>'+escapeHTML(o.ref)+' · '+money(o.total)+'</strong><small>'+escapeHTML(o.items)+' · '+date(o.created)+'</small></span>'+openButton('orders',o.ref)+'</div>').join('') || '<p class="hint">No orders yet.</p>');
    content += '<h3 style="margin-top:22px">Enquiries from this email ('+messages.length+')</h3>'+(messages.map(e=>'<div class="list-row"><span class="list-main"><strong>'+escapeHTML(e.subject)+'</strong><small>'+date(e.created)+'</small></span>'+openButton('enquiries',e.id)+'</div>').join('')||'<p class="hint">No enquiries from this email address.</p>');
    if (membership) content += '<h3 style="margin-top:22px">Membership</h3><p>'+escapeHTML(membership.plan)+' · '+label(membership.status)+' '+openButton('memberships',membership.user_id)+'</p>';
  }
  if (row.email) content += '<div class="detail-links"><a class="secondary" href="mailto:'+encodeURIComponent(row.email)+'?subject='+encodeURIComponent(kind==='orders'?'RaiseSport order '+row.ref:'RaiseSport: '+(row.subject||row.plan||'Your account'))+'">Open email app ↗</a></div>';
  $('detailContent').innerHTML = content;
  $('detailStatus').innerHTML = (statuses[kind]||[]).map(s=>'<option value="'+s+'">'+label(s)+'</option>').join('');
  $('detailStatus').value = row.status || '';
  $('detailNotes').value = row.notes || '';
  if (!$('detailDialog').open) $('detailDialog').showModal();
}
function csvExport() {
  const rows = filteredRows();
  if (!rows.length) return toast('No records to export.');
  const keys = Object.keys(rows[0]).filter(k=>k!=='lines');
  const cell = value => {
    let text = String(value??'');
    if (/^[=+\-@\t\r\n]/.test(text)) text="'"+text;
    return '"'+text.replace(/"/g,'""')+'"';
  };
  const csv = '\uFEFF'+[keys.map(cell).join(','),...rows.map(row=>keys.map(k=>cell(['created','updated'].includes(k)?(row[k]?date(row[k]):''):row[k])).join(','))].join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  const link=document.createElement('a');link.href=url;link.download='raisesport-'+view+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
document.addEventListener('click',e=>{
  const nav=e.target.closest('[data-view],[data-go]');
  if(nav) setView(nav.dataset.view||nav.dataset.go);
  const detail=e.target.closest('[data-kind][data-ref]');
  if(detail) openDetail(detail.dataset.kind,detail.dataset.ref);
});
$('detailForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!currentDetail)return;
  $('saveDetail').disabled=true;
  try {
    await api('update',{kind:currentDetail.kind,reference:currentDetail.ref,status:$('detailStatus').value,notes:$('detailNotes').value});
    $('detailDialog').close();toast('Changes saved.');await refresh();
  } catch(error) {$('detailError').textContent=error.message;}
  finally {$('saveDetail').disabled=false;}
});
$('passwordForm').addEventListener('submit',async e=>{
  e.preventDefault();const button=e.target.querySelector('button[type="submit"]');button.disabled=true;
  try {await api('password',{current:$('currentPassword').value,password:$('newPassword').value});e.target.reset();Auth.notify();signOut();}
  catch(error) {$('passwordError').textContent=error.message;}
  finally {button.disabled=false;}
});
$('logoutBtn').addEventListener('click',()=>Auth.logout().catch(error=>toast(error.message)));
$('refreshBtn').addEventListener('click',refresh);
$('athleteManagementBtn').addEventListener('click',()=>{location.href='/team/';});
$('search').addEventListener('input',render);
$('statusFilter').addEventListener('change',render);
$('exportBtn').addEventListener('click',csvExport);
$('closeDetail').addEventListener('click',()=>$('detailDialog').close());
$('settingsBtn').addEventListener('click',()=>{$('passwordForm').reset();$('passwordError').textContent='';$('passwordDialog').showModal();});
$('closePassword').addEventListener('click',()=>$('passwordDialog').close());
setInterval(()=>{if(!document.hidden&&!document.querySelector('dialog[open]'))refresh();},30000);
Auth.requireRole(['academy_manager']).then(user=>{if(user)refresh();});
