"""Run with: python test_backend.py. Uses temporary storage only."""
import contextlib, io, json, os, re, tempfile, threading, unittest
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent / 'backend'))
from urllib.request import Request, urlopen
from urllib.error import HTTPError

class BackendTest(unittest.TestCase):
    def test_flows(self):
        with tempfile.TemporaryDirectory() as folder:
            os.environ['RAISESPORT_DATA'] = folder
            import server
            http = server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
            thread = threading.Thread(target=http.serve_forever,daemon=True)
            thread.start()
            base = 'http://127.0.0.1:'+str(http.server_port)
            def call(path,body=None,token=None):
                headers = {'Content-Type':'application/json'}
                if token: headers['Authorization'] = 'Bearer '+token
                req = Request(base+path,data=json.dumps(body).encode() if body is not None else None,headers=headers)
                try:
                    with urlopen(req) as r: return r.status,json.load(r)
                except HTTPError as e:
                    with e: return e.code,json.load(e)
            try:
                with server.connect() as db:
                    db.execute("INSERT INTO users(name,email,password,verified,role) VALUES ('Test Manager','manager-test@example.com',?,1,'academy_manager')",(server.password('manager-test-password'),))
                self.assertEqual(call('/api/health')[1]['service'],'raisesport-local')
                self.assertEqual(len(call('/api/products')[1]['prices']),12)
                with urlopen(base+'/checkout/') as r: self.assertIn(b'Contact details',r.read())
                with urlopen(base) as r: self.assertIn(b'RaiseSport',r.read())
                self.assertEqual(call('/server.py')[0],404)
                self.assertEqual(call('/data/raisesport.sqlite3')[0],404)
                self.assertEqual(call('/api/me')[0],401)
                status,registered = call('/api/auth/signup',{'name':'Test Athlete','email':'test@example.com','password':'test-password'})
                self.assertEqual(status,200)
                self.assertFalse(registered['needsVerification'])
                self.assertEqual(registered['role'],'athlete')
                self.assertEqual(call('/api/auth/login',{'email':'test@example.com','password':'wrong'})[0],401)
                token = call('/api/auth/login',{'email':'test@example.com','password':'test-password'})[1]['token']
                self.assertEqual(call('/api/manager/data')[0],401)
                self.assertEqual(call('/api/manager/data',token=token)[0],403)
                self.assertEqual(call('/api/manager/login',{'email':'manager-test@example.com','password':'wrong'})[0],401)
                manager_token = call('/api/manager/login',{'email':'manager-test@example.com','password':'manager-test-password'})[1]['token']
                with urlopen(Request(base+'/manager/',headers={'Authorization':'Bearer '+manager_token})) as r: self.assertIn(b'Academy workspace',r.read())
                with urlopen(base+'/manager/dashboard.js') as r: self.assertEqual(r.status,200)
                with urlopen(base+'/styles.css') as r: self.assertEqual(r.status,200)
                self.assertEqual(call('/api/subscriptions',{'plan':'Starter Athlete','billing':'annual'},token)[1]['amount'],1440)
                order = call('/api/orders',{'items':[{'name':'Hoodie','qty':2,'price':1}]},token)[1]
                self.assertEqual(order['total'],798)
                self.assertEqual(call('/api/orders',{'items':[{'name':'Hoodie','qty':-1}]},token)[0],400)
                self.assertEqual(len(call('/api/me',token=token)[1]['orders']),1)
                self.assertEqual(call('/api/contact',{'name':'Test','email':'test@example.com','subject':'Test','message':'Hello'})[0],200)
                self.assertEqual(call('/api/newsletter',{'email':'test@example.com'})[0],200)
                self.assertEqual(call('/api/orders',{'items':[{'name':'Beanie','qty':1}],'fulfilment':'delivery'},token)[0],400)
                delivery = call('/api/orders',{'items':[{'name':'Beanie','qty':1}],'fulfilment':'delivery','phone':'0821234567','address':'123 Test Street, Durban, 4001'},token)[1]
                dashboard = call('/api/manager/data',token=manager_token)[1]
                self.assertEqual(len(dashboard['orders']),2)
                self.assertEqual(dashboard['orders'][0]['address'],'123 Test Street, Durban, 4001')
                self.assertEqual(dashboard['orders'][0]['email'],'test@example.com')
                self.assertNotIn('password',dashboard['customers'][0])
                self.assertEqual(len(dashboard['newsletter']),1)
                enquiry = dashboard['enquiries'][0]
                self.assertEqual(call('/api/manager/update',{'kind':'enquiries','reference':str(enquiry['id']),'status':'in_progress','notes':'Call customer'},manager_token)[0],200)
                self.assertEqual(call('/api/manager/update',{'kind':'orders','reference':delivery['ref'],'status':'paid','notes':'Bank receipt checked'},manager_token)[0],200)
                self.assertEqual(call('/api/manager/update',{'kind':'memberships','reference':str(dashboard['memberships'][0]['user_id']),'status':'active','notes':'Approved'},manager_token)[0],200)
                self.assertEqual(call('/api/manager/update',{'kind':'orders','reference':delivery['ref'],'status':'fake'},manager_token)[0],400)
                customer = call('/api/me',token=token)[1]
                self.assertEqual(customer['subscription']['status'],'active')
                self.assertTrue(any(o['status']=='paid' for o in customer['orders']))
                dashboard = call('/api/manager/data',token=manager_token)[1]
                self.assertEqual(dashboard['enquiries'][0]['notes'],'Call customer')
                self.assertEqual(len(dashboard['activity']),3)
                self.assertEqual(dashboard['customers'][0]['paid_total'],150)
                self.assertEqual(call('/api/manager/password',{'current':'wrong','password':'new-manager-password'},manager_token)[0],403)
                self.assertEqual(call('/api/manager/password',{'current':'manager-test-password','password':'new-manager-password'},manager_token)[0],200)
                self.assertEqual(call('/api/manager/data',token=manager_token)[0],401)
                manager_token = call('/api/manager/login',{'email':'manager-test@example.com','password':'new-manager-password'})[1]['token']
                self.assertEqual(call('/api/manager/logout',{},manager_token)[0],200)
                self.assertEqual(call('/api/manager/data',token=manager_token)[0],401)
                with server.connect() as db:
                    self.assertEqual(db.execute('SELECT COUNT(*) FROM contacts').fetchone()[0],1)
                    self.assertNotIn('test-password',db.execute('SELECT password FROM users').fetchone()[0])
            finally:
                http.shutdown()
                http.server_close()
                thread.join()

if __name__ == '__main__':
    unittest.main()
