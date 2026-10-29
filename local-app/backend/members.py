"""Athlete profiles, schedules, messages and scoped coach access."""
import hmac
import re
import secrets
import time
from urllib.parse import parse_qs, urlsplit

def initialise(db):
    db.executescript('''
    CREATE TABLE IF NOT EXISTS athlete_profiles(user_id INTEGER PRIMARY KEY,phone TEXT DEFAULT '',sport TEXT DEFAULT 'Football',position TEXT DEFAULT '',club TEXT DEFAULT '',hometown TEXT DEFAULT '',bio TEXT DEFAULT '');
    CREATE TABLE IF NOT EXISTS athlete_assignments(athlete_id INTEGER PRIMARY KEY,manager_id INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS athlete_events(id INTEGER PRIMARY KEY,athlete_id INTEGER,title TEXT,kind TEXT,starts REAL,venue TEXT,details TEXT,status TEXT DEFAULT 'scheduled');
    CREATE TABLE IF NOT EXISTS athlete_messages(id INTEGER PRIMARY KEY,athlete_id INTEGER,author TEXT,body TEXT,created REAL);
    CREATE INDEX IF NOT EXISTS events_athlete ON athlete_events(athlete_id,starts);
    CREATE INDEX IF NOT EXISTS messages_athlete ON athlete_messages(athlete_id,created);
    ''')

def profile(db,user_id):
    db.execute('INSERT OR IGNORE INTO athlete_profiles(user_id) VALUES (?)',(user_id,))
    return dict(db.execute('SELECT * FROM athlete_profiles WHERE user_id=?',(user_id,)).fetchone())

def athlete_record(db,athlete_id,private=False):
    u=db.execute("SELECT id,name,email,role,created FROM users WHERE id=? AND role='athlete'",(athlete_id,)).fetchone()
    if not u:
        from server import Problem
        raise Problem('Athlete not found.',404)
    columns='*' if private else 'user_id,plan,billing,amount,status,created,updated'
    s=db.execute('SELECT '+columns+' FROM subscriptions WHERE user_id=?',(athlete_id,)).fetchone()
    assigned=db.execute('SELECT u.id,u.name,u.email FROM users u JOIN athlete_assignments a ON a.manager_id=u.id WHERE a.athlete_id=?',(athlete_id,)).fetchone()
    return {'user':dict(u),'profile':profile(db,athlete_id),'subscription':dict(s) if s else None,
            'manager':dict(assigned) if assigned else None,
            'events':[dict(r) for r in db.execute('SELECT * FROM athlete_events WHERE athlete_id=? ORDER BY starts',(athlete_id,))],
            'messages':[dict(r) for r in db.execute('SELECT id,author,body,created FROM athlete_messages WHERE athlete_id=? ORDER BY created DESC LIMIT 100',(athlete_id,))]}

def staff(handler,db):
    from server import Problem
    user=handler.user(db)
    if user['role'] not in ('coach','academy_manager'):
        raise Problem('Coach or manager access is required.',403)
    return dict(user)

def require_athlete(db,viewer,athlete_id):
    from server import Problem
    if viewer['role']!='academy_manager' and not db.execute('SELECT 1 FROM athlete_assignments WHERE athlete_id=? AND manager_id=?',(athlete_id,viewer['id'])).fetchone():
        raise Problem('This athlete is not assigned to you.',403)
    if not db.execute("SELECT 1 FROM users WHERE id=? AND role='athlete'",(athlete_id,)).fetchone():
        raise Problem('Athlete not found.',404)

def route(handler,db,path,body):
    from server import Problem,password,digest
    def field(key,limit=200):
        value=body.get(key,'')
        if not isinstance(value,str) or len(value)>limit:
            raise Problem('Please check '+key+'.')
        return value.strip()
    if path.startswith('/api/team/'):
        viewer=staff(handler,db)
        if path=='/api/team/create-manager' and handler.command=='POST':
            if viewer['role']!='academy_manager':
                raise Problem('Only the academy manager can create coach accounts.',403)
            name,email=field('name'),field('email',254).lower()
            if len(name)<2 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]{2,}',email):
                raise Problem('Enter a name and valid email address.')
            if db.execute('SELECT 1 FROM users WHERE email=?',(email,)).fetchone():
                raise Problem('This email is already registered.',409)
            temporary=secrets.token_urlsafe(12)
            db.execute("INSERT INTO users(name,email,password,verified,created,role) VALUES (?,?,?,?,?,'coach')",(name,email,password(temporary),1,time.time()))
            return {'email':email,'password':temporary}
        if path=='/api/team/data' and handler.command=='GET':
            where="u.role='athlete'"
            args=()
            if viewer['role']!='academy_manager':
                where+=' AND a.manager_id=?'
                args=(viewer['id'],)
            rows=db.execute('SELECT u.id,u.name,u.email,u.created,p.phone,p.sport,p.position,p.club,s.status,s.plan,s.billing,s.amount,a.manager_id,m.name AS manager_name FROM users u LEFT JOIN athlete_profiles p ON p.user_id=u.id LEFT JOIN subscriptions s ON s.user_id=u.id LEFT JOIN athlete_assignments a ON a.athlete_id=u.id LEFT JOIN users m ON m.id=a.manager_id WHERE '+where+' ORDER BY u.id DESC',args)
            managers=[dict(r) for r in db.execute("SELECT id,name,email FROM users WHERE role='coach' ORDER BY name")] if viewer['role']=='academy_manager' else []
            return {'viewer':{'name':viewer['name'],'role':viewer['role']},'athletes':[dict(r) for r in rows],'managers':managers}
        if handler.command=='GET':
            params=parse_qs(urlsplit(handler.path).query)
            athlete_id=int(params.get('id',['0'])[0])
        else:
            athlete_id=body.get('athlete_id')
            if type(athlete_id) is not int:
                raise Problem('Choose an athlete.')
        require_athlete(db,viewer,athlete_id)
        if path=='/api/team/athlete' and handler.command=='GET':
            return athlete_record(db,athlete_id,private=True)
        if handler.command!='POST':
            raise Problem('Not found.',404)
        if path=='/api/team/membership':
            status=field('status')
            if status not in ('pending','active','cancelled'):
                raise Problem('Choose a valid status.')
            row=db.execute('SELECT status FROM subscriptions WHERE user_id=?',(athlete_id,)).fetchone()
            if not row:
                raise Problem('The athlete must request a membership first.')
            db.execute('UPDATE subscriptions SET status=?,notes=?,updated=? WHERE user_id=?',(status,field('notes',10000),time.time(),athlete_id))
            db.execute('INSERT INTO manager_activity(kind,reference,detail,created) VALUES (?,?,?,?)',('memberships',str(athlete_id),viewer['name']+': '+row['status']+' -> '+status,time.time()))
            return {'ok':True}
        if path=='/api/team/assign':
            if viewer['role']!='academy_manager':
                raise Problem('Only the academy manager can assign athletes.',403)
            manager_id=body.get('manager_id')
            if manager_id is None:
                db.execute('DELETE FROM athlete_assignments WHERE athlete_id=?',(athlete_id,))
            elif type(manager_id) is int and db.execute("SELECT 1 FROM users WHERE id=? AND role='coach'",(manager_id,)).fetchone():
                db.execute('INSERT OR REPLACE INTO athlete_assignments VALUES (?,?)',(athlete_id,manager_id))
            else:
                raise Problem('Choose a coach.')
            return {'ok':True}
        if path=='/api/team/event':
            title,kind,venue=field('title'),field('kind'),field('venue',500)
            starts=body.get('starts')
            if len(title)<2 or kind not in ('training','match','meeting') or type(starts) not in (int,float) or not 0<starts<4102444800 or not venue:
                raise Problem('Enter an event title, valid date, type and venue.')
            db.execute('INSERT INTO athlete_events(athlete_id,title,kind,starts,venue,details) VALUES (?,?,?,?,?,?)',(athlete_id,title,kind,starts,venue,field('details',2000)))
            return {'ok':True}
        if path=='/api/team/event-status':
            status,event_id=field('status'),body.get('event_id')
            if status not in ('scheduled','completed','cancelled') or type(event_id) is not int:
                raise Problem('Choose a valid event and status.')
            result=db.execute('UPDATE athlete_events SET status=? WHERE id=? AND athlete_id=?',(status,event_id,athlete_id))
            if not result.rowcount:
                raise Problem('Event not found.',404)
            return {'ok':True}
        if path=='/api/team/message':
            message=field('message',4000)
            if not message:
                raise Problem('Enter a message.')
            db.execute('INSERT INTO athlete_messages(athlete_id,author,body,created) VALUES (?,?,?,?)',(athlete_id,viewer['name'],message,time.time()))
            return {'ok':True}
        raise Problem('Not found.',404)
    u=handler.user(db)
    if path=='/api/members/password' and handler.command=='POST':
        old,new=body.get('current',''),body.get('password','')
        if not isinstance(old,str) or not isinstance(new,str) or len(old)>256 or not 8<=len(new)<=256:
            raise Problem('Choose a password of at least 8 characters.')
        if not hmac.compare_digest(password(old,u['password'].split(':')[0]),u['password']):
            raise Problem('Your current password is incorrect.',403)
        db.execute('UPDATE users SET password=? WHERE id=?',(password(new),u['id']))
        db.execute('DELETE FROM sessions WHERE user_id=?',(u['id'],))
        db.execute('DELETE FROM manager_sessions WHERE user_id=?',(u['id'],))
        return {'ok':True}
    if u['role']!='athlete':
        raise Problem('Open the coach dashboard for this account.',403)
    if path=='/api/members/dashboard' and handler.command=='GET':
        result=athlete_record(db,u['id'])
        result['orders']=[dict(r) for r in db.execute('SELECT ref,items,total,status,created,fulfilment,address FROM orders WHERE user_id=? ORDER BY created DESC',(u['id'],))]
        return result
    if path=='/api/members/profile' and handler.command=='POST':
        name=field('name')
        if len(name)<2:
            raise Problem('Enter your full name.')
        profile(db,u['id'])
        db.execute('UPDATE users SET name=? WHERE id=?',(name,u['id']))
        db.execute('UPDATE athlete_profiles SET phone=?,sport=?,position=?,club=?,hometown=?,bio=? WHERE user_id=?',(field('phone',40),field('sport',80),field('position',80),field('club',150),field('hometown',150),field('bio',2000),u['id']))
        return {'ok':True}
    if path=='/api/members/message' and handler.command=='POST':
        if not db.execute('SELECT 1 FROM athlete_assignments WHERE athlete_id=?',(u['id'],)).fetchone():
            raise Problem('Your academy manager has not assigned a coach yet. Please use the contact form.')
        message=field('message',4000)
        if not message:
            raise Problem('Enter a message.')
        db.execute('INSERT INTO athlete_messages(athlete_id,author,body,created) VALUES (?,?,?,?)',(u['id'],u['name'],message,time.time()))
        return {'ok':True}
    raise Problem('Not found.',404)
