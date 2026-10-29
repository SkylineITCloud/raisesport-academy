"""Account creation, role boundaries, athlete profiles and manager workflows."""
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from urllib.request import Request,urlopen
from urllib.error import HTTPError
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'backend'))

class MembershipTest(unittest.TestCase):
    def test_registration_and_manager_workflows(self):
        with tempfile.TemporaryDirectory() as folder:
            os.environ['RAISESPORT_DATA']=folder
            import server
            http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
            thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
            base='http://127.0.0.1:'+str(http.server_port)
            def call(path,body=None,token=None):
                request=Request(base+'/api/'+path,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json',**({'Authorization':'Bearer '+token} if token else {})})
                try:
                    with urlopen(request) as response:return response.status,json.load(response)
                except HTTPError as error:
                    with error:return error.code,json.load(error)
            try:
                self.assertEqual(call('auth/signup',{'name':'Test','email':'test@example.com','password':'short'})[0],400)
                self.assertEqual(call('auth/signup',{'name':'Test','email':'test@example.com','password':'test-password','role':'coach'})[0],403)
                status,first=call('auth/signup',{'name':'First Athlete','email':'FIRST@example.com','password':' athlete-password ','phone':'0821234567','billing':'annual'})
                self.assertEqual(status,200);a=first['token']
                self.assertFalse(first['emailVerified'])
                self.assertEqual(call('auth/login',{'email':'first@example.com','password':' athlete-password '})[0],200)
                self.assertEqual(call('auth/signup',{'name':'First Athlete','email':'first@example.com','password':'test-password'})[0],409)
                second=call('auth/signup',{'name':'Second Athlete','email':'second@example.com','password':'second-password'})[1];b=second['token']
                first_record=call('members/dashboard',token=a)[1];aid=first_record['user']['id']
                bid=call('members/dashboard',token=b)[1]['user']['id']
                self.assertEqual(first_record['subscription']['status'],'pending');self.assertEqual(first_record['subscription']['amount'],1440)
                self.assertEqual(call('team/data',token=a)[0],403)
                self.assertEqual(call('members/message',{'message':'Hello'},a)[0],400)
                self.assertEqual(call('members/profile',{'name':'First Athlete Updated','phone':'0820000000','sport':'Football','position':'Goalkeeper','club':'Test Club','hometown':'Durban','bio':'Training goals'},a)[0],200)
                with server.connect() as db:
                    manager=db.execute("INSERT INTO users(name,email,password,verified,role) VALUES (?,?,?,1,'coach')",('Coach One','coach@example.com',server.password('coach-password'))).lastrowid
                    db.execute("INSERT INTO users(name,email,password,verified,role) VALUES (?,?,?,1,'coach')",('Coach Two','coach2@example.com',server.password('coach2-password')))
                    db.execute("INSERT INTO users(name,email,password,verified,role) VALUES (?,?,?,1,'academy_manager')",('Academy Admin','admin@example.com',server.password('admin-password')))
                    db.execute('INSERT INTO athlete_assignments VALUES (?,?)',(aid,manager))
                coach=call('auth/login',{'email':'coach@example.com','password':'coach-password'})[1]['token']
                other_coach=call('auth/login',{'email':'coach2@example.com','password':'coach2-password'})[1]['token']
                admin=call('auth/login',{'email':'admin@example.com','password':'admin-password'})[1]['token']
                self.assertEqual(call('manager/data',token=coach)[0],403)
                self.assertEqual(len(call('team/data',token=coach)[1]['athletes']),1)
                self.assertEqual(len(call('team/data',token=other_coach)[1]['athletes']),0)
                self.assertEqual(call('team/athlete?id='+str(bid),token=coach)[0],403)
                self.assertEqual(call('team/membership',{'athlete_id':bid,'status':'active'},coach)[0],403)
                self.assertEqual(call('team/assign',{'athlete_id':aid,'manager_id':manager},coach)[0],403)
                self.assertEqual(call('team/create-manager',{'name':'Bad','email':'bad@example.com'},coach)[0],403)
                self.assertEqual(call('subscriptions',{'plan':'Starter Athlete','billing':'monthly'},coach)[0],403)
                self.assertEqual(call('team/membership',{'athlete_id':aid,'status':'active','notes':'PRIVATE: academy approval'},coach)[0],200)
                member=call('members/dashboard',token=a)[1]
                self.assertEqual(member['subscription']['status'],'active');self.assertNotIn('notes',member['subscription'])
                self.assertEqual(member['manager']['name'],'Coach One');self.assertEqual(member['profile']['position'],'Goalkeeper')
                self.assertEqual(call('team/event',{'athlete_id':aid,'title':'Training session','kind':'training','starts':time.time()+86400,'venue':'Academy pitch','details':'Bring boots'},coach)[0],200)
                member=call('members/dashboard',token=a)[1];event_id=member['events'][0]['id']
                self.assertEqual(call('team/event-status',{'athlete_id':aid,'event_id':event_id,'status':'completed'},coach)[0],200)
                self.assertEqual(call('members/dashboard',token=b)[1]['events'],[])
                self.assertEqual(call('members/message',{'message':'What time should I arrive?'},a)[0],200)
                self.assertEqual(call('team/message',{'athlete_id':aid,'message':'Arrive 15 minutes early.'},coach)[0],200)
                self.assertEqual(len(call('members/dashboard',token=a)[1]['messages']),2)
                self.assertEqual(call('members/dashboard',token=b)[1]['messages'],[])
                self.assertEqual(call('manager/data',token=admin)[0],200)
                self.assertEqual(len(call('team/data',token=admin)[1]['athletes']),2)
                self.assertEqual(call('team/assign',{'athlete_id':bid,'manager_id':manager},admin)[0],200)
                self.assertEqual(len(call('team/data',token=coach)[1]['athletes']),2)
                status,created=call('team/create-manager',{'name':'New Coach','email':'newcoach@example.com'},admin)
                self.assertEqual(status,200)
                self.assertEqual(call('auth/login',{'email':created['email'],'password':created['password']})[1]['role'],'coach')
                self.assertEqual(call('members/password',{'current':'coach-password','password':'changed-coach-password'},coach)[0],200)
                self.assertEqual(call('team/data',token=coach)[0],401)
                self.assertEqual(call('auth/login',{'email':'coach@example.com','password':'changed-coach-password'})[0],200)
                self.assertEqual(call('manager/password',{'current':'admin-password','password':'changed-admin-password'},admin)[0],200)
                self.assertEqual(call('manager/data',token=admin)[0],401)
                self.assertEqual(call('auth/logout',{},a)[0],200)
                self.assertEqual(call('members/dashboard',token=a)[0],401)
            finally:
                http.shutdown();http.server_close();thread.join()

if __name__=='__main__':unittest.main()
