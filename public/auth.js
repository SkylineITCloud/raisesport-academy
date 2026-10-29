'use strict';
// Every page uses the same server-owned, HttpOnly session. No stored role grants access.
window.Auth=(()=>{
  const homes={athlete:'/athlete/',coach:'/coach/',academy_manager:'/manager/'};
  let session=null,lastSent=0,expiring=false;
  function clearLegacy(){for(const key of ['rs_token','rs_role','rs_user','rs_manager_token']){localStorage.removeItem(key);sessionStorage.removeItem(key);}}
  clearLegacy();
  async function api(path,body,method){
    const response=await fetch(path,{method:method||(body===undefined?'GET':'POST'),credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const result=await response.json().catch(()=>({}));
    if(result.session){session=result.session;}
    if(!response.ok){if(response.status===401&&session&&path!=='/api/auth/login')expire();const error=new Error(result.error||'Unable to complete this request.');error.status=response.status;throw error;}
    return result;
  }
  const home=role=>homes[role]||'/login/';
  function hidePrivate(){document.querySelectorAll('[data-private]').forEach(el=>el.hidden=true);document.querySelectorAll('dialog[open]').forEach(el=>el.close());}
  function notify(){clearLegacy();localStorage.setItem('rs_session_changed',Date.now()+':'+Math.random());}
  async function requireRole(roles){try{const {user}=await api('/api/auth/me');if(!roles.includes(user.role)){hidePrivate();location.replace(home(user.role));return null;}return user;}catch(error){hidePrivate();location.replace('/login/');return null;}}
  async function logout(){await api('/api/auth/logout',{});hidePrivate();notify();location.replace('/login/');}
  async function expire(){if(expiring)return;expiring=true;hidePrivate();try{await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});}catch(_){}notify();location.replace('/login/?expired=1');}
  async function activity(){if(!session||expiring||Date.now()-lastSent<60000)return;if(Date.now()/1000>=Math.min(session.idleExpires,session.absoluteExpires)){expire();return;}lastSent=Date.now();try{const result=await api('/api/auth/activity',{});localStorage.setItem('rs_session_activity',JSON.stringify(result.session));}catch(error){if(error.status===401)expire();}}
  for(const event of ['pointerdown','keydown','wheel','touchstart'])addEventListener(event,activity,{passive:true});
  setInterval(()=>{if(session&&!expiring&&Date.now()/1000>=Math.min(session.idleExpires,session.absoluteExpires))expire();},5000);
  addEventListener('visibilitychange',()=>{if(session&&!document.hidden&&Date.now()/1000>=Math.min(session.idleExpires,session.absoluteExpires))expire();});
  addEventListener('storage',event=>{if(event.key==='rs_session_activity'&&session){try{const shared=JSON.parse(event.newValue);if(shared.absoluteExpires===session.absoluteExpires&&shared.idleExpires>session.idleExpires)session=shared;}catch(_){}}});
  addEventListener('storage',event=>{if(event.key==='rs_session_changed'){hidePrivate();location.replace('/login/');}});
  addEventListener('pageshow',event=>{if(event.persisted){hidePrivate();location.reload();}});
  return {api,home,requireRole,logout,notify,hidePrivate};
})();
