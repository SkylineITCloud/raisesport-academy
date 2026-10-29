"""Check an original database upgrades without losing existing records."""
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

class MigrationTest(unittest.TestCase):
    def test_original_records_survive(self):
        with tempfile.TemporaryDirectory() as folder:
            db = sqlite3.connect(Path(folder)/'raisesport.sqlite3')
            db.executescript('''
            CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT,email TEXT UNIQUE,password TEXT,verified INTEGER DEFAULT 0,code TEXT,expires REAL,sent REAL DEFAULT 0,attempts INTEGER DEFAULT 0);
            CREATE TABLE orders(ref TEXT PRIMARY KEY,user_id INTEGER,items TEXT,total REAL,status TEXT,created REAL);
            CREATE TABLE contacts(id INTEGER PRIMARY KEY,name TEXT,email TEXT,subject TEXT,message TEXT,created REAL);
            CREATE TABLE subscriptions(user_id INTEGER PRIMARY KEY,plan TEXT,billing TEXT,amount REAL,status TEXT);
            INSERT INTO users(id,name,email,password) VALUES(1,'Existing customer','existing@example.com','original-hash');
            INSERT INTO orders VALUES('RS-EXISTING',1,'1 x Beanie',150,'pending',1000);
            INSERT INTO contacts VALUES(1,'Existing sender','existing@example.com','Membership','Keep my enquiry',1000);
            INSERT INTO subscriptions VALUES(1,'Starter Athlete','monthly',150,'pending');
            ''')
            db.commit()
            db.close()
            env = {**os.environ,'RAISESPORT_DATA':folder,'PYTHONPATH':str(Path(__file__).resolve().parent.parent/'backend')}
            # Import twice, matching two server restarts, to check upgrades are repeatable.
            for _ in range(2):
                result = subprocess.run([sys.executable,'-c','import server'],env=env,capture_output=True,text=True)
                self.assertEqual(result.returncode,0,result.stderr)
            db = sqlite3.connect(Path(folder)/'raisesport.sqlite3')
            try:
                self.assertEqual(db.execute('SELECT name,password FROM users').fetchone(),('Existing customer','original-hash'))
                self.assertEqual(db.execute('SELECT ref,total FROM orders').fetchone(),('RS-EXISTING',150))
                self.assertEqual(db.execute('SELECT message,status,notes FROM contacts').fetchone(),('Keep my enquiry','new',''))
                self.assertEqual(db.execute('SELECT status,created FROM subscriptions').fetchone(),('pending',None))
                self.assertEqual(db.execute('SELECT phone,address,lines FROM orders').fetchone(),('','','[]'))
            finally:
                db.close()

if __name__=='__main__':
    unittest.main()
