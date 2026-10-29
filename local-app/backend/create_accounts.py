"""Provision the three requested local accounts. Preserve IDs and related records."""
import time
from server import connect,password,DATA

DEFINITIONS=(
 ('Athlete','athlete@gmail.com','athlete','athlete@raisesport.example'),
 ('Coach','coach@gmail.com','coach','athlete.manager@raisesport.example'),
 ('Manager','manager@gmail.com','academy_manager','academy.manager@raisesport.example'),
)

def create_accounts(reset=False):
 credentials=[]
 ids={}
 with connect() as db:
  for name,email,role,previous in DEFINITIONS:
   current=db.execute('SELECT id,role FROM users WHERE email=?',(email,)).fetchone()
   legacy=db.execute('SELECT id,role FROM users WHERE email=?',(previous,)).fetchone()
   if current and legacy and current['id']!=legacy['id']:
    raise RuntimeError('Both old and requested email accounts exist. No account was overwritten: '+email)
   existing=current or legacy
   if existing and existing['role']!=role:
    raise RuntimeError('The requested email belongs to another role: '+email)
   if existing:
    user_id=existing['id']
    db.execute('UPDATE users SET email=?,role=?,name=? WHERE id=?',(email,role,name,user_id))
    if reset:
     db.execute('UPDATE users SET password=? WHERE id=?',(password('password'),user_id))
     db.execute('DELETE FROM sessions WHERE user_id=?',(user_id,))
   else:
    user_id=db.execute('INSERT INTO users(name,email,password,verified,created,role) VALUES (?,?,?,?,?,?)',(name,email,password('password'),1,time.time(),role)).lastrowid
    if role=='athlete':
     db.execute('INSERT INTO athlete_profiles(user_id,sport) VALUES (?,?)',(user_id,'Football'))
     db.execute("INSERT INTO subscriptions(user_id,plan,billing,amount,status,created,updated,notes) VALUES (?,'Starter Athlete','monthly',150,'active',?,?,?)",(user_id,time.time(),time.time(),'Local demonstration membership. No payment recorded.'))
   ids[role]=user_id
   credentials.append({'role':role,'email':email,'password':'password'})
  db.execute('INSERT OR IGNORE INTO athlete_assignments VALUES (?,?)',(ids['athlete'],ids['coach']))
  if reset:
   db.execute('DELETE FROM manager_sessions')
   db.execute('DELETE FROM account_login_attempts')
 text='RAISESPORT LOCAL LOGINS\nSign in: http://127.0.0.1:3000/login/\n\n'
 for item in credentials:text+='Role: '+item['role']+'\nEmail: '+item['email']+'\nPassword: password\n\n'
 text+='These are application logins only, not Gmail mailbox credentials.\nExisting athlete records and assignments are preserved. Payments are coming soon.\n'
 (DATA/'PRIVATE-LOGINS.txt').write_text(text,encoding='utf-8')
 return credentials

if __name__=='__main__':
 import json,sys
 print(json.dumps(create_accounts(reset='--reset-requested' in sys.argv),indent=2))
