'use strict';
const $ = id=>document.getElementById(id);
const esc = value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value=>'R'+Number(value).toLocaleString('en-ZA');
let cart=[], submitting=false;
try {const saved=JSON.parse(localStorage.getItem('rs_cart')||'[]');if(Array.isArray(saved))cart=saved;} catch(_) {}
async function api(path,body){return Auth.api('/api/'+path,body);}
function showError(id,message){$(id).textContent=message;$(id).hidden=false;}
function addressVisibility(){const delivery=$('orderFulfilment').value==='delivery';$('addressField').hidden=!delivery;$('orderAddress').required=delivery;}
async function init(){
  if(!cart.length){$('emptyCart').hidden=false;return;}
  try {
    const {prices}=await api('products');
    if(cart.some(i=>!i||!Object.hasOwn(prices,i.name)||!Number.isInteger(i.qty)||i.qty<1||i.qty>20))throw new Error('Some cart items are invalid. Return to the cart and remove them.');
    cart=cart.map(i=>({...i,price:prices[i.name]}));
    $('summaryItems').innerHTML=cart.map(i=>{
      const image=typeof i.img==='string'&&/^\/?images\//.test(i.img)?'/'+i.img.replace(/^\//,''):'';
      return '<div class="summary-product">'+(image?'<img src="'+esc(image)+'" alt="'+esc(i.name)+'">':'<span></span>')+'<div><strong>'+esc(i.name)+'</strong><small>Qty '+i.qty+' · '+money(i.price)+' each</small></div><b>'+money(i.price*i.qty)+'</b></div>';
    }).join('');
    $('summaryTotal').textContent=money(cart.reduce((sum,i)=>sum+i.price*i.qty,0));
    $('checkoutLayout').hidden=false;
    try {
      const me=await api('me');if(me.user.role!=='athlete'){location.replace(Auth.home(me.user.role));return;}$('orderName').value=me.user.name;$('orderEmail').value=me.user.email;$('checkoutForm').hidden=false;
    }catch(error){if(error.status===401){$('signInNotice').hidden=false;}else throw error;}
  }catch(error){showError('pageError',error.message);}
}
$('orderFulfilment').addEventListener('change',addressVisibility);
$('checkoutForm').addEventListener('submit',async event=>{
  event.preventDefault();if(submitting||!cart.length)return;
  submitting=true;$('placeOrder').disabled=true;$('placeOrder').textContent='Saving your order…';$('orderError').hidden=true;
  try {
    const order=await api('orders',{items:cart.map(i=>({name:i.name,qty:i.qty})),name:$('orderName').value,phone:$('orderPhone').value,fulfilment:$('orderFulfilment').value,address:$('orderFulfilment').value==='delivery'?$('orderAddress').value:'',customer_notes:$('orderNotes').value});
    localStorage.removeItem('rs_cart');cart=[];$('checkoutLayout').hidden=true;$('orderSuccess').hidden=false;$('successReference').textContent='Order reference: '+order.ref;$('successTotal').textContent='Product total: '+money(order.total);$('orderSuccess').focus();window.scrollTo(0,0);
  }catch(error){showError('orderError',error.message);if(error.status===401){$('signInNotice').hidden=false;$('checkoutForm').hidden=true;}}
  finally{submitting=false;$('placeOrder').disabled=false;$('placeOrder').textContent='Place order →';}
});
addressVisibility();init();
