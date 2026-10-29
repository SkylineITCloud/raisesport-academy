"""Local RaiseSport backend; Python 3 standard library only."""
import hashlib, hmac, json, os, re, secrets, sqlite3, time, webbrowser
from contextlib import contextmanager
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / 'frontend'
DATA = Path(os.environ.get('RAISESPORT_DATA', str(ROOT / 'data')))
DATA.mkdir(parents=True, exist_ok=True)
DB = DATA / 'raisesport.sqlite3'
PRICES = {'Beanie':150, 'Hoodie':399, 'Jacket':550, 'T-Shirt':349, 'Match Ball':450, 'Supporter Scarf':220, 'Baseball Cap':280, 'Goalkeeper Gloves':270, 'Backpack & Socks Set':540, 'DAD Ball':399, 'Training Bibs':650, 'Agility Training Kit':700}

@contextmanager
def connect():
    db = sqlite3.connect(DB, timeout=15)
    db.row_factory = sqlite3.Row
    try:
        with db:
            yield db
    finally:
        db.close()

with connect() as db:
    db.executescript('''
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT,email TEXT UNIQUE,password TEXT,verified INTEGER DEFAULT 0,code TEXT,expires REAL,sent REAL DEFAULT 0,attempts INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER,expires REAL);
    CREATE TABLE IF NOT EXISTS subscriptions(user_id INTEGER PRIMARY KEY,plan TEXT,billing TEXT,amount REAL,status TEXT);
    CREATE TABLE IF NOT EXISTS orders(ref TEXT PRIMARY KEY,user_id INTEGER,items TEXT,total REAL,status TEXT,created REAL);
    CREATE TABLE IF NOT EXISTS contacts(id INTEGER PRIMARY KEY,name TEXT,email TEXT,subject TEXT,message TEXT,created REAL);
    CREATE TABLE IF NOT EXISTS newsletter(email TEXT PRIMARY KEY,created REAL);
    ''')
    # Add columns in place so existing accounts, enquiries and orders are preserved.
    for table, columns in {
        'users': {'created': 'REAL', 'role': "TEXT DEFAULT 'athlete'"},
        'sessions': {'last_seen':'REAL'},
        'contacts': {'status': "TEXT DEFAULT 'new'", 'notes': "TEXT DEFAULT ''", 'phone': "TEXT DEFAULT ''", 'updated': 'REAL'},
        'orders': {'phone': "TEXT DEFAULT ''", 'address': "TEXT DEFAULT ''", 'fulfilment': "TEXT DEFAULT 'collection'", 'notes': "TEXT DEFAULT ''", 'updated': 'REAL', 'lines': "TEXT DEFAULT '[]'", 'customer_name': "TEXT DEFAULT ''", 'customer_notes': "TEXT DEFAULT ''"},
        'subscriptions': {'created': 'REAL', 'updated': 'REAL', 'notes': "TEXT DEFAULT ''"},
    }.items():
        existing = {r['name'] for r in db.execute('PRAGMA table_info('+table+')')}
        for column, definition in columns.items():
            if column not in existing:
                db.execute('ALTER TABLE '+table+' ADD COLUMN '+column+' '+definition)
    from manager import initialise
    initialise(db)
    from members import initialise as initialise_members
    initialise_members(db)
    db.execute('CREATE TABLE IF NOT EXISTS account_login_attempts(email TEXT,created REAL)')
    db.execute("UPDATE users SET role='coach' WHERE role='athlete_manager'")
    db.execute('CREATE TABLE IF NOT EXISTS app_settings(key TEXT PRIMARY KEY,value TEXT)')
    version=db.execute("SELECT value FROM app_settings WHERE key='session_version'").fetchone()
    if not version or version['value']!='6':
        db.execute('DELETE FROM sessions')
        db.execute('DELETE FROM manager_sessions')
        db.execute("INSERT OR REPLACE INTO app_settings VALUES ('session_version','6')")

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

def password(value, salt=None):
    salt = salt or secrets.token_hex(16)
    return salt + ':' + hashlib.scrypt(value.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()

class Problem(Exception):
    def __init__(self, message, status=400, **extra):
        self.message, self.status, self.extra = message, status, extra

class Handler(BaseHTTPRequestHandler):
    def reply(self, body, status=200):
        body = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        if hasattr(self,'session_cookie'):
            self.send_header('Set-Cookie',self.session_cookie)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if urlsplit(self.path).path.startswith('/api/'):
            return self.api()
        path = unquote(urlsplit(self.path).path).lstrip('/') or 'index.html'
        try:
            candidate=(PUBLIC/path).resolve()
            if not candidate.is_relative_to(PUBLIC):
                return self.reply({'error':'Not found.'},404)
            path=candidate.relative_to(PUBLIC).as_posix()
        except (ValueError,OSError):
            return self.reply({'error':'Not found.'},404)
        # Protect the actual HTML response, including direct index.html URLs.
        page_roles={'athlete':'athlete','coach':'coach','manager':'academy_manager','team':'academy_manager'}
        section=path.split('/')[0]
        is_private=section in page_roles and path in (section,section+'/',section+'/index.html')
        if is_private:
            from security import current_user,HOMES
            with connect() as db:
                user=current_user(self,db)
            if not user:
                return self.redirect('/login/')
            if user['role']!=page_roles[section]:
                return self.redirect(HOMES[user['role']])
        if path in ('login','login/'):
            path='login/index.html'
        if path in ('manager', 'manager/'):
            path = 'manager/index.html'
        if path in ('checkout', 'checkout/'):
            path = 'checkout/index.html'
        if path in ('athlete', 'athlete/'):
            path = 'athlete/index.html'
        if path in ('team', 'team/'):
            path = 'coach/index.html'
        if path in ('team/index.html','coach','coach/'):
            path = 'coach/index.html'
        file = (PUBLIC / path).resolve()
        allowed = path in ('index.html','script.js','styles.css','auth.js','login/index.html','login/login.js','manager/index.html','manager/dashboard.js','manager/dashboard.css','checkout/index.html','checkout/checkout.js','checkout/checkout.css','athlete/index.html','athlete/athlete.js','athlete/membership.css','coach/index.html','coach/coach.js') or path.startswith('images/')
        if not allowed or not file.is_relative_to(PUBLIC) or not file.is_file():
            return self.reply({'error':'Not found.'},404)
        import mimetypes
        body = file.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type',mimetypes.guess_type(str(file))[0] or 'application/octet-stream')
        self.send_header('Content-Length',str(len(body)))
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Cache-Control','no-store' if is_private or path=='login/index.html' else 'no-cache')
        self.send_header('Referrer-Policy','same-origin')
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        origin = self.headers.get('Origin')
        if origin and origin != 'http://' + self.headers.get('Host',''):
            return self.reply({'error':'Use the local website for this request.'},403)
        self.api()

    def api(self):
        try:
            with connect() as db:
                result = self.route(db)
            self.reply(result)
        except Problem as e:
            self.reply({'error':e.message, **e.extra},e.status)
        except (ValueError,TypeError,KeyError):
            self.reply({'error':'Please check the information you entered.'},400)
        except Exception as e:
            print('Server error:',repr(e),flush=True)
            self.reply({'error':'Unable to complete this request.'},500)

    def user(self,db):
        from security import current_user
        u=current_user(self,db)
        if not u:
            raise Problem('Please log in again.',401)
        return u

    def redirect(self,target):
        self.send_response(303)
        self.send_header('Location',target)
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Length','0')
        self.end_headers()

    def route(self,db):
        path = urlsplit(self.path).path
        if path=='/api/auth/me' and self.command=='GET':
            from accounts import route
            return route(self,db,path,{})
        if (path.startswith('/api/members/') or path.startswith('/api/team/')) and self.command == 'GET':
            from members import route
            return route(self,db,path,{})
        if path.startswith('/api/manager/') and self.command == 'GET':
            from manager import route
            return route(self, db, path, {})
        if self.command == 'GET':
            if path == '/api/health':
                return {'ok':True,'service':'raisesport-local','registration':'local','version':6}
            if path == '/api/products':
                return {'prices':PRICES}
            if path == '/api/me':
                u = self.user(db)
                s = db.execute('SELECT plan,billing,amount,status FROM subscriptions WHERE user_id=?',(u['id'],)).fetchone()
                orders = db.execute('SELECT ref,items,total,status FROM orders WHERE user_id=? ORDER BY created DESC',(u['id'],)).fetchall()
                return {'user':{'name':u['name'],'email':u['email'],'role':u['role']},'subscription':dict(s) if s else None,'orders':[dict(o) for o in orders]}
            raise Problem('Not found.',404)
        size = int(self.headers.get('Content-Length','0'))
        if not 0 < size <= 32768:
            raise Problem('Request is empty or too large.',413)
        b = json.loads(self.rfile.read(size))
        if not isinstance(b,dict):
            raise Problem('Invalid request.')
        def field(name,limit=200):
            v = b.get(name,'')
            if not isinstance(v,str) or len(v)>limit:
                raise Problem('Please check '+name+'.')
            return v.strip()
        def email():
            v = field('email',254).lower()
            if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]{2,}',v):
                raise Problem('Enter a valid email address.')
            return v
        if path.startswith('/api/manager/'):
            from manager import route
            return route(self, db, path, b)
        if path.startswith('/api/members/') or path.startswith('/api/team/'):
            from members import route
            return route(self, db, path, b)
        if path.startswith('/api/auth/'):
            from accounts import route
            return route(self,db,path,b)
        if path == '/api/contact':
            name,address,subject,message = field('name'),email(),field('subject'),field('message',10000)
            if not name or not message:
                raise Problem('Enter your name and message.')
            db.execute('INSERT INTO contacts(name,email,subject,message,created,phone) VALUES (?,?,?,?,?,?)',(name,address,subject,message,time.time(),field('phone',40)))
            return {'ok':True}
        if path == '/api/newsletter':
            db.execute('INSERT OR IGNORE INTO newsletter VALUES (?,?)',(email(),time.time()))
            return {'ok':True}
        if path == '/api/subscriptions':
            u = self.user(db)
            if u['role']!='athlete':
                raise Problem('Membership requests are for athlete accounts.',403)
            plan,billing = field('plan'),field('billing')
            if plan!='Starter Athlete' or billing not in ('monthly','annual'):
                raise Problem('Choose a valid membership.')
            amount = 1440 if billing=='annual' else 150
            existing = db.execute('SELECT status FROM subscriptions WHERE user_id=?',(u['id'],)).fetchone()
            if existing and existing['status'] == 'active':
                raise Problem('Your membership is already active. Contact RaiseSport to change your plan.')
            db.execute('INSERT INTO subscriptions(user_id,plan,billing,amount,status,created,updated) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan,billing=excluded.billing,amount=excluded.amount,status=excluded.status,updated=excluded.updated',(u['id'],plan,billing,amount,'pending',time.time(),time.time()))
            return {'plan':plan,'amount':amount,'status':'pending'}
        if path == '/api/orders':
            u = self.user(db)
            if u['role']!='athlete':
                raise Problem('Only athlete accounts can place personal orders.',403)
            items = b.get('items')
            if not isinstance(items,list) or not 1<=len(items)<=20:
                raise Problem('Please add items to your cart.')
            total,lines,seen,details = 0,[],set(),[]
            for item in items:
                if not isinstance(item,dict):
                    raise Problem('Invalid item.')
                name,qty = item.get('name'),item.get('qty')
                if not isinstance(name,str) or name not in PRICES or type(qty) is not int or not 1<=qty<=20 or name in seen:
                    raise Problem('Invalid product or quantity.')
                seen.add(name)
                total += PRICES[name]*qty
                lines.append(str(qty)+' x '+name)
                details.append({'name':name,'qty':qty,'unit_price':PRICES[name]})
            phone,address,fulfilment = field('phone',40),field('address',1000),field('fulfilment') or 'collection'
            customer_name,customer_notes = field('name') or u['name'],field('customer_notes',2000)
            if len(customer_name)<2:
                raise Problem('Enter a full contact name.')
            if fulfilment not in ('collection','delivery'):
                raise Problem('Choose collection or delivery.')
            if fulfilment == 'delivery' and (not address or not phone):
                raise Problem('Enter your phone number and delivery address.')
            ref = 'RS-'+secrets.token_hex(5).upper()
            db.execute('INSERT INTO orders(ref,user_id,items,total,status,created,phone,address,fulfilment,lines,customer_name,customer_notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',(ref,u['id'],', '.join(lines),total,'pending',time.time(),phone,address,fulfilment,json.dumps(details),customer_name,customer_notes))
            return {'ref':ref,'total':total,'discount':0,'status':'pending'}
        if path == '/api/payfast/checkout':
            self.user(db)
            raise Problem('PayFast is coming soon. No payment has been taken.',503)
        raise Problem('Not found.',404)

def open_pages(port):
    import sys
    base='http://127.0.0.1:'+str(port)
    if '--open-all' in sys.argv:
        webbrowser.open(base+'/')
        webbrowser.open(base+'/login/')
    else:
        webbrowser.open(base+('/manager/' if '--manager' in sys.argv else '/coach/' if '--team' in sys.argv else '/athlete/' if '--athlete' in sys.argv else '/'))

def main():
    port = int(os.environ.get('RAISESPORT_PORT','3000'))
    try:
        server = ThreadingHTTPServer(('127.0.0.1',port),Handler)
    except OSError as e:
        from urllib.request import urlopen
        try:
            with urlopen('http://127.0.0.1:'+str(port)+'/api/health',timeout=2) as response:
                running = json.load(response)
            if running.get('service') == 'raisesport-local':
                if running.get('version',1) < 6 or '--reset-manager' in __import__('sys').argv:
                    print('Close the existing RaiseSport command window first, then run this launcher again.')
                    return
                if '--no-browser' not in __import__('sys').argv:
                    open_pages(port)
                print('RaiseSport is already running. Opened it in your browser.')
                return
        except Exception:
            pass
        print('Unable to start: port '+str(port)+' may already be in use. '+str(e))
        raise SystemExit(1)
    with connect() as db:
        db.execute('DELETE FROM sessions')
    print('\nRaiseSport: http://127.0.0.1:'+str(port)+'\nManager dashboard: http://127.0.0.1:'+str(port)+'/manager/\nKeep this window open. Close it or press Ctrl+C to stop.\nSaved data: '+str(DB)+'\nRegistration works locally. PayFast and bank transfer are coming soon.\n',flush=True)
    if '--no-browser' not in __import__('sys').argv:
        open_pages(port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nRaiseSport stopped.')
    finally:
        server.server_close()

if __name__ == '__main__':
    main()
