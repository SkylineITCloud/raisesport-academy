/* ================= API helper ================= */
// Leave empty when the backend serves the website. If the website is hosted elsewhere, set e.g. 'https://api.yourdomain.co.za'
let currentUser=null;
async function api(path,method='GET',body){return Auth.api('/api'+path,body,method);}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const statusTag = s => ({ delivered: 'ok', paid: 'ok', shipped: 'ok', active: 'ok' }[s] || 'warn');

/* Header scroll */
window.addEventListener('scroll', () => document.getElementById('header').classList.toggle('scrolled', scrollY > 10));

/* Mobile menu */
function toggleMenu() { document.getElementById('navLinks').classList.toggle('mobile'); }
document.querySelectorAll('#navLinks a').forEach(a => a.addEventListener('click', () => document.getElementById('navLinks').classList.remove('mobile')));

/* Active nav on scroll */
const sections = ['home', 'about', 'services', 'plans', 'sponsor', 'shop', 'gallery', 'contact'];
window.addEventListener('scroll', () => {
  let cur = 'home';
  sections.forEach(id => { const el = document.getElementById(id); if (el && scrollY >= el.offsetTop - 140) cur = id; });
  document.querySelectorAll('.nav-links a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + cur));
});

/* Reveal on scroll */
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

/* Counter animation */
const cio = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return; cio.unobserve(e.target);
  const t = +e.target.dataset.count, d = 1600, st = performance.now();
  (function tick(n) { const p = Math.min((n - st) / d, 1); e.target.textContent = Math.floor(t * (1 - Math.pow(1 - p, 3))).toLocaleString(); if (p < 1) requestAnimationFrame(tick); })(st);
}), { threshold: .5 });
document.querySelectorAll('[data-count]').forEach(el => cio.observe(el));

/* ================= Plans ================= */
let annual = false;

function toggleBilling() {
  annual = !annual;
  document.getElementById('billSwitch').classList.toggle('on', annual);
  document.getElementById('lblMonthly').style.color = annual ? 'var(--slate)' : 'var(--ink)';
  document.getElementById('lblAnnual').style.color = annual ? 'var(--green-dark)' : 'var(--slate)';
  document.getElementById('lblAnnual').style.fontWeight = annual ? '800' : '600';
  document.getElementById('lblMonthly').style.fontWeight = annual ? '600' : '800';
  document.querySelectorAll('.pval').forEach(el => {
    el.textContent = (+el.dataset[annual ? 'a' : 'm']).toLocaleString();
    el.nextElementSibling.textContent = annual ? ' /year' : ' /month';
  });
}

async function selectPlan(el, name) {
  document.querySelectorAll('.plan').forEach(p => p.classList.remove('selected'));
  el.classList.add('selected');
  const note = document.getElementById('planNote');
  document.getElementById('planName').textContent = name + ' (' + (annual ? 'Annual' : 'Monthly') + ')';
  if (!currentUser) { openAuth('signup'); return; }
  if (currentUser.role !== 'athlete') { location.href=Auth.home(currentUser.role); return; }
  await subscribe(name);
}

async function subscribe(name) {
  try {
    const r = await api('/subscriptions', 'POST', { plan: name, billing: annual ? 'annual' : 'monthly' });
    document.getElementById('planNote').innerHTML =
      '<b style="color:var(--green-dark)">' + esc(r.plan) + '</b> requested (R' + r.amount.toLocaleString() +
      (annual ? '/year' : '/month') + '). We\'ll contact you to complete payment and activate your membership.';
  } catch (err) { alert(err.message); }
}

/* Sponsor packages */
function enquirePackage(name) {
  const subj = document.getElementById('csubj'), msg = document.getElementById('cmsg');
  subj.value = 'Sponsorship';
  if (name && !msg.value.trim()) msg.value = "Hi, I'm interested in the " + name + " sponsorship package. Please send me more details.";
  document.getElementById('contact').scrollIntoView({ behavior: 'smooth' });
  setTimeout(() => (name ? msg : document.getElementById('cname')).focus({ preventScroll: true }), 600);
}

/* ================= Shop cart ================= */
let cart = [];
try { cart = JSON.parse(localStorage.getItem('rs_cart') || '[]'); } catch (e) { cart = []; }
let lastFocus = null;

const money = n => 'R' + Number(n).toLocaleString('en-ZA');
function saveCart() { try { localStorage.setItem('rs_cart', JSON.stringify(cart)); } catch (e) {} }
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

// Prices here are for display only: the server looks up real prices by product name.
function addToCart(name, price, btn) {
  const card = btn && btn.closest('.product');
  const img = card && card.querySelector('img') ? card.querySelector('img').getAttribute('src') : '';
  const line = cart.find(i => i.name === name);
  if (line) line.qty = Math.min(line.qty + 1, 20); else cart.push({ name, price, qty: 1, img });
  saveCart(); renderCart();
  const b = document.getElementById('cartBtn'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
  toast(name + ' added to cart');
}
function changeQty(i, d) {
  if (!cart[i]) return;
  cart[i].qty = Math.min(Math.max(cart[i].qty + d, 0), 20);
  if (cart[i].qty === 0) cart.splice(i, 1);
  saveCart(); renderCart();
}
function removeItem(i) { cart.splice(i, 1); saveCart(); renderCart(); }

function renderCart() {
  const count = cart.reduce((n, i) => n + i.qty, 0);
  const badge = document.getElementById('cartCount');
  badge.textContent = count; badge.hidden = count === 0;
  document.getElementById('cartBtn').setAttribute('aria-label', 'Open cart (' + count + ' item' + (count === 1 ? '' : 's') + ')');
  const list = document.getElementById('cartItems'), foot = document.getElementById('cartFoot');
  foot.style.display = cart.length ? '' : 'none';
  if (!cart.length) {
    list.innerHTML = '<div class="cart-empty"><p>Your cart is empty.</p><a href="#shop" class="btn btn-primary" onclick="closeCart()">Browse the shop</a></div>';
    return;
  }
  list.innerHTML = cart.map((i, idx) =>
    '<div class="cart-row">' +
      '<img src="' + esc(i.img) + '" alt="' + esc(i.name) + '">' +
      '<div><b>' + esc(i.name) + '</b><span class="c-price">' + money(i.price) + ' each</span>' +
        '<div class="qty"><button type="button" onclick="changeQty(' + idx + ',-1)" aria-label="Decrease quantity of ' + esc(i.name) + '">&minus;</button>' +
        '<span aria-live="polite">' + i.qty + '</span>' +
        '<button type="button" onclick="changeQty(' + idx + ',1)" aria-label="Increase quantity of ' + esc(i.name) + '">+</button></div></div>' +
      '<div class="cart-line"><b>' + money(i.price * i.qty) + '</b><br><button type="button" class="cart-rm" onclick="removeItem(' + idx + ')" aria-label="Remove ' + esc(i.name) + '">Remove</button></div>' +
    '</div>').join('');
  document.getElementById('cartSubtotal').textContent = money(cart.reduce((n, i) => n + i.price * i.qty, 0));
}

function openCart() {
  clearTimeout(toast._t);
  document.getElementById('toast').classList.remove('show');
  lastFocus = document.activeElement;
  document.getElementById('cartView').style.display = '';
  renderCart();
  document.getElementById('cartBg').classList.add('open');
  const d = document.getElementById('cartDrawer'); d.classList.add('open'); d.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  d.querySelector('.cart-x').focus();
}
function closeCart() {
  document.getElementById('cartBg').classList.remove('open');
  const d = document.getElementById('cartDrawer'); d.classList.remove('open'); d.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('cartDrawer').classList.contains('open')) closeCart(); });

function checkout() {
  if (!cart.length) return;
  saveCart();
  location.href = '/checkout/';
}

document.addEventListener('DOMContentLoaded', renderCart);

/* ================= Contact & newsletter ================= */
async function submitContact(e) {
  e.preventDefault();
  const msg = document.getElementById('contactMsg');
  try {
    await api('/contact', 'POST', {
      name: document.getElementById('cname').value, email: document.getElementById('cemail').value,
      subject: document.getElementById('csubj').value, message: document.getElementById('cmsg').value,
      phone: document.getElementById('cphone').value
    });
    msg.textContent = '✓ Message saved on this computer.';
    e.target.reset();
  } catch (err) { msg.textContent = err.message; }
  msg.style.display = 'block';
  setTimeout(() => msg.style.display = 'none', 5000);
}
async function subscribeNews(e) {
  e.preventDefault();
  const msg = document.getElementById('newsMsg');
  try {
    await api('/newsletter', 'POST', { email: document.getElementById('newsEmail').value });
    msg.textContent = '✓ Subscribed — welcome to the team!';
    document.getElementById('newsEmail').value = '';
  } catch (err) { msg.textContent = err.message; }
  msg.style.display = 'block';
}

/* One sign-in page for every role. */
function openAuth(mode){location.href='/login/'+(mode==='signup'?'?mode=register&billing='+(annual?'annual':'monthly'):'');}
function openDash(){location.href=currentUser?Auth.home(currentUser.role):'/login/';}
document.addEventListener('DOMContentLoaded',async()=>{
 const first=document.querySelector('.plan');if(first)first.classList.add('selected');
 const params=new URLSearchParams(location.search);
 if(params.get('cart')==='1'){history.replaceState(null,'',location.pathname);openCart();}
 if(params.get('checkout')==='1'){location.replace('/login/?next=checkout');return;}
 try{const result=await Auth.api('/api/auth/me');currentUser=result.user;document.getElementById('navLogin').textContent='My Dashboard';document.getElementById('navLogin').onclick=openDash;document.getElementById('navJoin').hidden=true;}catch(_){}
 if(params.get('orders')==='1')location.replace(currentUser?.role==='athlete'?'/athlete/?view=orders':currentUser?Auth.home(currentUser.role):'/login/');
});
