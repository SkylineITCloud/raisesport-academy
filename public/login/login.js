'use strict';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
let registering=params.get('mode')==='register'||params.get('register')==='1';
function mode(value){registering=value;$('registerFields').hidden=!value;$('registerPlan').hidden=!value;$('memberName').required=value;$('memberPhone').required=value;$('confirmPassword').required=value;$('memberPassword').minLength=value?8:1;$('memberPassword').autocomplete=value?'new-password':'current-password';$('loginTab').classList.toggle('active',!value);$('registerTab').classList.toggle('active',value);$('authHeading').textContent=value?'Join RaiseSport.':'Welcome to RaiseSport.';$('authDescription').textContent=value?'Create an athlete account and request your membership.':'Sign in to your athlete, coach or manager account.';$('authSubmit').textContent=value?'Create athlete account →':'Sign in →';$('authError').textContent='';}
$('loginTab').addEventListener('click',()=>mode(false));$('registerTab').addEventListener('click',()=>mode(true));
$('memberBilling').value=params.get('billing')==='annual'?'annual':'monthly';
$('memberAuthForm').addEventListener('submit',async event=>{
 event.preventDefault();$('authSubmit').disabled=true;$('authError').textContent='';
 try{
  if(registering&&$('memberPassword').value!==$('confirmPassword').value)throw new Error('Passwords do not match.');
  const result=await Auth.api('/api/auth/'+(registering?'signup':'login'),{email:$('memberEmail').value,password:$('memberPassword').value,...(registering?{name:$('memberName').value,phone:$('memberPhone').value,billing:$('memberBilling').value}:{})});
  Auth.notify();$('memberPassword').value='';$('confirmPassword').value='';
  location.replace(result.role==='athlete'&&params.get('next')==='checkout'?'/checkout/':Auth.home(result.role));
 }catch(error){$('authError').textContent=error.message;}finally{$('authSubmit').disabled=false;}
});
mode(registering);
if(params.get('expired')==='1')$('authError').textContent='Your session expired. Please sign in again.';
Auth.api('/api/auth/me').then(({user})=>{location.replace(user.role==='athlete'&&params.get('next')==='checkout'?'/checkout/':Auth.home(user.role));}).catch(()=>{});
