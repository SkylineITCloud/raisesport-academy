"""Manager access and dashboard API, separate from customer accounts."""
import hashlib
import hmac
import secrets
import time

def initialise(db):
    db.executescript('''
    CREATE TABLE IF NOT EXISTS manager_account(id INTEGER PRIMARY KEY CHECK(id=1),password TEXT);
    CREATE TABLE IF NOT EXISTS manager_sessions(token TEXT PRIMARY KEY,expires REAL);
    CREATE TABLE IF NOT EXISTS manager_login_attempts(created REAL);
    CREATE TABLE IF NOT EXISTS manager_activity(id INTEGER PRIMARY KEY,kind TEXT,reference TEXT,detail TEXT,created REAL);
    ''')
    if 'user_id' not in {r['name'] for r in db.execute('PRAGMA table_info(manager_sessions)')}:
        db.execute('ALTER TABLE manager_sessions ADD COLUMN user_id INTEGER')

def route(handler, db, path, body):
    from server import Problem, password, digest
    def field(name, limit=200):
        value = body.get(name,'')
        if not isinstance(value,str) or len(value)>limit:
            raise Problem('Please check '+name+'.')
        return value.strip()
    if path == '/api/manager/login' and handler.command == 'POST':
        from accounts import route as account_route
        return account_route(handler,db,'/api/auth/login',{**body,'expected_role':'academy_manager'})
    user=handler.user(db)
    if user['role']!='academy_manager':
        raise Problem('Manager access is required.',403)
    if path == '/api/manager/logout' and handler.command == 'POST':
        from accounts import route as account_route
        return account_route(handler,db,'/api/auth/logout',{})
    if path == '/api/manager/password' and handler.command == 'POST':
        from members import route as member_route
        return member_route(handler,db,'/api/members/password',{'current':body.get('current',''),'password':body.get('password','')})
    if path == '/api/manager/data' and handler.command == 'GET':
        def rows(sql):
            return [dict(r) for r in db.execute(sql)]
        return {
            'orders':rows('SELECT o.*,u.name,u.email FROM orders o JOIN users u ON o.user_id=u.id ORDER BY o.created DESC'),
            'enquiries':rows('SELECT * FROM contacts ORDER BY created DESC'),
            'memberships':rows('SELECT s.*,u.name,u.email FROM subscriptions s JOIN users u ON s.user_id=u.id ORDER BY COALESCE(s.updated,s.created,0) DESC'),
            'customers':rows('SELECT u.id,u.name,u.email,u.verified,u.created,COUNT(o.ref) AS order_count,COALESCE(SUM(CASE WHEN o.status IN (\'paid\',\'shipped\',\'delivered\') THEN o.total ELSE 0 END),0) AS paid_total FROM users u LEFT JOIN orders o ON o.user_id=u.id GROUP BY u.id ORDER BY u.id DESC'),
            'newsletter':rows('SELECT email,created FROM newsletter ORDER BY created DESC'),
            'activity':rows('SELECT kind,reference,detail,created FROM manager_activity ORDER BY id DESC LIMIT 100'),
        }
    if path == '/api/manager/update' and handler.command == 'POST':
        kind,reference,status,notes = field('kind'),field('reference'),field('status'),field('notes',10000)
        options = {
            'orders':('orders','ref',('pending','paid','shipped','delivered','cancelled')),
            'enquiries':('contacts','id',('new','in_progress','resolved')),
            'memberships':('subscriptions','user_id',('pending','active','cancelled')),
        }
        if kind not in options:
            raise Problem('Choose a valid record.')
        table,key,statuses = options[kind]
        if status not in statuses:
            raise Problem('Choose a valid status.')
        row = db.execute('SELECT * FROM '+table+' WHERE '+key+'=?',(reference,)).fetchone()
        if not row:
            raise Problem('Record not found.',404)
        db.execute('UPDATE '+table+' SET status=?,notes=?,updated=? WHERE '+key+'=?',(status,notes,time.time(),reference))
        detail = 'Status: '+row['status']+' -> '+status
        if row['notes'] != notes:
            detail += '; internal notes updated'
        db.execute('INSERT INTO manager_activity(kind,reference,detail,created) VALUES (?,?,?,?)',(kind,reference,detail,time.time()))
        return {'ok':True}
    raise Problem('Not found.',404)
