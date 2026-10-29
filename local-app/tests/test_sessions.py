"""Session keys, idle timeout, absolute expiry, activity and logout checks."""
import json,os,sys,tempfile,threading,time,unittest
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'backend'))

class SessionTest(unittest.TestCase):
    def test_session_lifetime(self):
        with tempfile.TemporaryDirectory() as folder:
            os.environ['RAISESPORT_DATA']=folder
            import server,create_accounts,security
            create_accounts.create_accounts(reset=True)
            http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
            worker=threading.Thread(target=http.serve_forever,daemon=True);worker.start()
            def call(path,body=None,token=None):
                req=Request('http://127.0.0.1:'+str(http.server_port)+'/api/'+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json',**({'Authorization':'Bearer '+token} if token else {})})
                try:
                    with urlopen(req) as r:return r.status,json.load(r),r.headers
                except HTTPError as e:
                    with e:return e.code,json.load(e),e.headers
            def login():
                status,result,headers=call('auth/login',{'email':'athlete@gmail.com','password':'password'})
                self.assertEqual(status,200);self.assertNotIn('Max-Age',headers['Set-Cookie']);self.assertIn('HttpOnly',headers['Set-Cookie'])
                self.assertEqual(result['session']['idleSeconds'],900)
                self.assertAlmostEqual(result['session']['absoluteExpires']-time.time(),28800,delta=5)
                return result['token']
            try:
                first=login();second=login();self.assertNotEqual(first,second)
                with server.connect() as db:
                    db.execute('UPDATE sessions SET last_seen=? WHERE token=?',(time.time()-901,server.digest(first)))
                self.assertEqual(call('members/dashboard',token=first)[0],401)
                self.assertEqual(call('auth/activity',{},first)[0],401)
                self.assertEqual(call('auth/me',token=second)[0],200)
                with server.connect() as db:
                    db.execute('UPDATE sessions SET last_seen=? WHERE token=?',(time.time()-600,server.digest(second)))
                before=call('auth/me',token=second)[1]['session']
                # Background reads must not extend inactivity.
                after=call('auth/me',token=second)[1]['session']
                self.assertEqual(before,after)
                activity=call('auth/activity',{},second)[1]['session']
                self.assertGreater(activity['idleExpires'],before['idleExpires'])
                self.assertEqual(activity['absoluteExpires'],before['absoluteExpires'])
                with server.connect() as db:
                    db.execute('UPDATE sessions SET expires=?,last_seen=? WHERE token=?',(time.time()-1,time.time(),server.digest(second)))
                self.assertEqual(call('auth/me',token=second)[0],401)
                self.assertEqual(call('auth/activity',{},second)[0],401)
                valid=login();self.assertEqual(call('auth/logout',{},valid)[0],200);self.assertEqual(call('auth/me',token=valid)[0],401)
            finally:http.shutdown();http.server_close();worker.join()

if __name__=='__main__':unittest.main()
