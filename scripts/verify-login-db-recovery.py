import json,urllib.request,urllib.parse,urllib.error,http.cookiejar,subprocess
from pathlib import Path
import argparse
parser=argparse.ArgumentParser(description='SALU 전용 개발 DB 중단·복구와 로그인 검증')
parser.add_argument('--db-outage', action='store_true', required=True, help='로컬 MySQL 일시 중단·복구 명시')
parser.add_argument('--account-file', default='.env.dev-login.json')
args=parser.parse_args()
root=Path(__file__).resolve().parent.parent
account=json.loads((root/args.account_file).read_text())
client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def request(path,body=None,token=None):
 headers={}
 if body is not None: headers['Content-Type']='application/x-www-form-urlencoded'
 if token: headers['X-CSRF-TOKEN']=token
 req=urllib.request.Request('http://127.0.0.1:8081'+path,data=None if body is None else urllib.parse.urlencode(body).encode(),headers=headers)
 try:
  with client.open(req,timeout=10) as r:return r.status,r.read().decode()
 except urllib.error.HTTPError as e:return e.code,e.read().decode()
def token():return json.loads(request('/api/csrf')[1])['token']
assert request('/api/auth/login',{'email':account['email'],'password':account['password']},token())[0]==200
csrf=token()
try:
 subprocess.run([str(root/'scripts/mysql-local.sh'),'stop'],check=True,stdout=subprocess.DEVNULL)
 status,body=request('/api/health');assert status==503 and json.loads(body)['database']=='DOWN'
 status,body=request('/api/auth/me');assert status==503 and json.loads(body)['code']=='DATABASE_UNAVAILABLE'
 status,body=request('/api/auth/login',{'email':account['email'],'password':account['password']},csrf)
 assert status==503 and json.loads(body)['code']=='AUTHENTICATION_UNAVAILABLE'
 assert all(s not in body for s in [account['password'],'password_hash','jdbc:','SELECT','stackTrace'])
 assert request('/api/auth/logout',{},csrf)[0]==204
 print('실제 DB 중단: health503·인증503·로그아웃204·오류 정보 비노출 통과')
finally:
 subprocess.run([str(root/'scripts/mysql-local.sh'),'start'],check=True,stdout=subprocess.DEVNULL)
assert request('/api/health')[0]==200
assert request('/api/auth/login',{'email':account['email'],'password':account['password']},token())[0]==200
assert request('/api/auth/logout',{},token())[0]==204
print('실제 DB 복구: health200·로그인200·로그아웃204 통과')
