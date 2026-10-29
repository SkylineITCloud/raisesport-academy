"""Local registration and login. Email ownership is not verified in local mode."""
import hmac
import re
import secrets
import time

def session(handler,db,u):
    from server import digest
    from security import token,set_cookie,HOMES,MAX_SESSION_SECONDS,IDLE_SECONDS
    previous=token(handler)
    if previous:
        db.execute('DELETE FROM sessions WHERE token=?',(digest(previous),))
    token=secrets.token_urlsafe(32)
    db.execute('DELETE FROM sessions WHERE expires<?',(time.time(),))
    now=time.time()
    db.execute('INSERT INTO sessions(token,user_id,expires,last_seen) VALUES (?,?,?,?)',(digest(token),u['id'],now+MAX_SESSION_SECONDS,now))
    set_cookie(handler,token,None)
    return {'token':token,'name':u['name'],'email':u['email'],'role':u['role'],'home':HOMES[u['role']],'emailVerified':False,'needsVerification':False,'session':{'idleSeconds':IDLE_SECONDS,'idleExpires':now+IDLE_SECONDS,'absoluteExpires':now+MAX_SESSION_SECONDS}}

def route(handler,db,path,body):
    from server import Problem,password,digest
    from security import token,set_cookie,public_user,HOMES,session_info
    if path=='/api/auth/me' and handler.command=='GET':
        u=handler.user(db)
        return {'user':public_user(u),'home':HOMES[u['role']],'session':session_info(handler,db)}
    if path=='/api/auth/activity' and handler.command=='POST':
        handler.user(db)
        db.execute('UPDATE sessions SET last_seen=? WHERE token=?',(time.time(),digest(token(handler))))
        return {'ok':True,'session':session_info(handler,db)}
    if path=='/api/auth/logout':
        value=token(handler)
        db.execute('DELETE FROM sessions WHERE token=?',(digest(value),))
        db.execute('DELETE FROM manager_sessions WHERE token=?',(digest(value),))
        set_cookie(handler)
        return {'ok':True}
    email=body.get('email','')
    pw=body.get('password','')
    if not isinstance(email,str) or len(email)>254 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]{2,}',email.strip()):
        raise Problem('Enter a valid email address.')
    if not isinstance(pw,str) or len(pw)>256:
        raise Problem('Please check your password.')
    email=email.strip().lower()
    u=db.execute('SELECT * FROM users WHERE email=?',(email,)).fetchone()
    if path=='/api/auth/signup':
        name,phone,billing=body.get('name',''),body.get('phone',''),body.get('billing','monthly')
        if not isinstance(name,str) or not 2<=len(name.strip())<=200 or len(pw)<8:
            raise Problem('Enter your name and a password of at least 8 characters.')
        if not isinstance(phone,str) or len(phone)>40 or billing not in ('monthly','annual'):
            raise Problem('Check your phone number and billing period.')
        if body.get('role','athlete')!='athlete':
            raise Problem('Manager accounts must be created by the academy.',403)
        if u:
            raise Problem('This email is already registered. Please log in.',409)
        result=db.execute("INSERT INTO users(name,email,password,verified,created,role) VALUES (?,?,?,?,?,'athlete')",(name.strip(),email,password(pw),1,time.time()))
        user_id=result.lastrowid
        db.execute('INSERT INTO athlete_profiles(user_id,phone) VALUES (?,?)',(user_id,phone.strip()))
        db.execute("INSERT INTO subscriptions(user_id,plan,billing,amount,status,created,updated) VALUES (?,'Starter Athlete',?,?,'pending',?,?)",(user_id,billing,1440 if billing=='annual' else 150,time.time(),time.time()))
        return session(handler,db,db.execute('SELECT * FROM users WHERE id=?',(user_id,)).fetchone())
    if path=='/api/auth/login':
        # Persist attempts per email; restarting the server does not bypass the limit.
        db.execute('DELETE FROM account_login_attempts WHERE created<?',(time.time()-60,))
        if db.execute('SELECT COUNT(*) FROM account_login_attempts WHERE email=?',(email,)).fetchone()[0]>=8:
            raise Problem('Too many login attempts. Please wait one minute.',429)
        db.execute('INSERT INTO account_login_attempts VALUES (?,?)',(email,time.time()))
        db.commit()
        stored=u['password'] if u else password('unused-password')
        if not hmac.compare_digest(password(pw,stored.split(':')[0]),stored) or not u:
            raise Problem('Incorrect email or password.',401)
        expected=body.get('expected_role')
        if expected and u['role']!=expected:
            raise Problem('Use the shared sign-in page for your account.',403)
        # Previous local code-gated accounts can now sign in with their password.
        db.execute('UPDATE users SET verified=1 WHERE id=?',(u['id'],))
        db.execute('DELETE FROM account_login_attempts WHERE email=?',(email,))
        return session(handler,db,u)
    raise Problem('Not found.',404)
