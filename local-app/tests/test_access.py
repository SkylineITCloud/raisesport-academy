"""Role, page, cookie, assignment and legacy-session isolation checks."""
from http.cookiejar import CookieJar
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from urllib.request import Request,build_opener,HTTPCookieProcessor,HTTPRedirectHandler
from urllib.error import HTTPError
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'backend'))

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args):return None

class AccessTest(unittest.TestCase):
    def test_role_boundaries(self):
        with tempfile.TemporaryDirectory() as folder:
            os.environ['RAISESPORT_DATA']=folder
            import server,create_accounts
            create_accounts.create_accounts(reset=True)
            http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
            thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
            base='http://127.0.0.1:'+str(http.server_port)
            def client():
                jar=CookieJar()
                return build_opener(HTTPCookieProcessor(jar),NoRedirect()),jar
            def request(client,path,body=None,headers=None):
                req=Request(base+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json',**(headers or {})})
                try:
                    with client.open(req) as response:return response.status,response.headers,response.read()
                except HTTPError as error:
                    with error:return error.code,error.headers,error.read()
            try:
                public,_=client()
                private=['/athlete/','/athlete/index.html','/coach/','/coach/index.html','/manager/','/manager/index.html','/team/','/team/index.html','/images/%2e%2e/manager/index.html','/images/..%5cmanager%5cindex.html']
                for page in private:
                    status,headers,body=request(public,page)
                    self.assertEqual(status,303,page);self.assertEqual(headers['Location'],'/login/');self.assertEqual(body,b'')
                self.assertEqual(request(public,'/api/manager/data')[0],401)
                self.assertEqual(request(public,'/api/manager/login',{'password':'password'})[0],400)
                with server.connect() as db:
                    db.execute('INSERT INTO manager_sessions(token,expires) VALUES (?,9999999999)',(server.digest('obsolete-admin-token'),))
                self.assertEqual(request(public,'/api/manager/data',headers={'Authorization':'Bearer obsolete-admin-token'})[0],401)
                policy={
                    'athlete':('athlete@gmail.com','/athlete/',{'/api/members/dashboard':200,'/api/team/data':403,'/api/manager/data':403}),
                    'coach':('coach@gmail.com','/coach/',{'/api/members/dashboard':403,'/api/team/data':200,'/api/manager/data':403}),
                    'academy_manager':('manager@gmail.com','/manager/',{'/api/members/dashboard':403,'/api/team/data':200,'/api/manager/data':200}),
                }
                for role,(email,home,apis) in policy.items():
                    current,jar=client()
                    status,headers,body=request(current,'/api/auth/login',{'email':email,'password':'password'})
                    self.assertEqual(status,200);self.assertEqual(json.loads(body)['role'],role)
                    self.assertIn('HttpOnly',headers['Set-Cookie']);self.assertIn('SameSite=Strict',headers['Set-Cookie'])
                    self.assertEqual(request(current,'/api/auth/me')[0],200)
                    for page in private:
                        allowed=(role=='athlete' and page.startswith('/athlete')) or (role=='coach' and page.startswith('/coach')) or (role=='academy_manager' and (page.startswith('/manager') or page.startswith('/team') or page.startswith('/images')))
                        status,headers,body=request(current,page)
                        self.assertEqual(status,200 if allowed else 303,(role,page))
                        if allowed:self.assertEqual(headers['Cache-Control'],'no-store')
                        else:self.assertEqual(headers['Location'],home)
                    for api,status in apis.items():self.assertEqual(request(current,api)[0],status,(role,api))
                    if role!='athlete':self.assertEqual(request(current,'/api/orders',{'items':[{'name':'Beanie','qty':1}]})[0],403)
                    value=next(c.value for c in jar if c.name=='rs_session')
                    self.assertEqual(request(current,'/api/auth/logout',{})[0],200)
                    self.assertEqual(request(current,'/api/auth/me')[0],401)
                    self.assertEqual(request(public,'/api/auth/me',headers={'Authorization':'Bearer '+value})[0],401)
                self.assertEqual(request(public,'/data/PRIVATE-LOGINS.txt')[0],404)
            finally:
                http.shutdown();http.server_close();thread.join()

if __name__=='__main__':unittest.main()
