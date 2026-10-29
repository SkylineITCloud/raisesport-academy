"""One session identity and role policy for pages and APIs."""
from http.cookies import SimpleCookie
import time

HOMES={'athlete':'/athlete/','coach':'/coach/','academy_manager':'/manager/'}
COOKIE='rs_session'
IDLE_SECONDS=15*60
MAX_SESSION_SECONDS=8*60*60

def token(handler):
    authorization=handler.headers.get('Authorization','')
    if authorization.startswith('Bearer '):
        return authorization[7:]
    cookies=SimpleCookie()
    try:
        cookies.load(handler.headers.get('Cookie',''))
        return cookies[COOKIE].value if COOKIE in cookies else ''
    except Exception:
        return ''

def current_user(handler,db):
    from server import digest
    value=token(handler)
    if not value:return None
    now=time.time()
    user=db.execute('SELECT users.* FROM users JOIN sessions ON sessions.user_id=users.id WHERE sessions.token=? AND sessions.expires>? AND sessions.last_seen>?',(digest(value),now,now-IDLE_SECONDS)).fetchone()
    return user if user and user['role'] in HOMES else None

def set_cookie(handler,value='',max_age=0):
    handler.session_cookie=COOKIE+'='+value+'; Path=/; HttpOnly; SameSite=Strict'+('' if max_age is None else '; Max-Age='+str(max_age))

def session_info(handler,db):
    from server import digest
    row=db.execute('SELECT expires,last_seen FROM sessions WHERE token=?',(digest(token(handler)),)).fetchone()
    return {'idleSeconds':IDLE_SECONDS,'idleExpires':row['last_seen']+IDLE_SECONDS,'absoluteExpires':row['expires']} if row else None

def public_user(user):
    return {key:user[key] for key in ('id','name','email','role')}
