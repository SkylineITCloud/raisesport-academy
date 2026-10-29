"""Portable startup checks. Every integration test uses its own temporary data."""
from pathlib import Path
import os,shutil,subprocess,sys

ROOT=Path(__file__).resolve().parent.parent
tests=(('Accounts, orders and enquiries','test_backend.py'),('Memberships and coach workflows','test_memberships.py'),('Existing data upgrades','test_migration.py'),('Dashboard and data permissions','test_access.py'),('Login session expiry','test_sessions.py'))
def main():
    if sys.version_info<(3,10):
        print('Python 3.10 or newer is required.');return 1
    failures=[];logs=[]
    for title,file in tests:
        result=subprocess.run([sys.executable,str(ROOT/'tests'/file)],cwd=ROOT,capture_output=True,text=True,timeout=90)
        logs.append(title+'\n'+result.stdout+result.stderr)
        print(('PASS: ' if result.returncode==0 else 'FAILED: ')+title,flush=True)
        if result.returncode:failures.append(title)
    node=shutil.which('node')
    if node:
        for file in sorted((ROOT/'frontend').rglob('*.js')):
            result=subprocess.run([node,'--check',str(file)],capture_output=True,text=True,timeout=20)
            if result.returncode:failures.append(str(file.relative_to(ROOT)));logs.append(result.stdout+result.stderr)
        print('Checked website and dashboard scripts.',flush=True)
    data=Path(os.environ.get('RAISESPORT_DATA',str(ROOT/'data')))
    data.mkdir(parents=True,exist_ok=True)
    (data/'startup-checks.log').write_text('\n\n'.join(logs),encoding='utf-8')
    if failures:
        print('Please check '+str(data/'startup-checks.log'));return 1
    print('All checks passed. Starting RaiseSport...',flush=True);return 0

if __name__=='__main__':raise SystemExit(main())
