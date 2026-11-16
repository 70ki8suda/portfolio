import argparse,os,sys,time,secrets
from contracts import *
from supervisor import supervise
p=argparse.ArgumentParser();p.add_argument('--manifest-sha',required=True);a=p.parse_args();m=check_manifest(a.manifest_sha)
lock=ROOT/'active.lock';lock.mkdir()
try:
 require(not (ROOT/'reservation.json').exists(),'run already reserved; no retries')
 require(type(m['directions']) is int and 0<m['directions']<=m['maxDirections'],'direction budget')
 chunks=[read(ROOT/(name+'.json')) for name in m['chunks']]
 require(len(m['chunks'])==len(set(m['chunks'])) and sum(map(len,chunks))==m['directions'],'chunks budget')
 require(all(0<len(c)<=128 for c in chunks),'chunk size')
 write_new(ROOT/'reservation.json',{'reserved':m['directions'],'manifestHash':a.manifest_sha,'oldBudgetTransferred':0,'time':time.time(),'retry':0})
 elapsed=0
 for name in m['chunks']:
  results=[read(p) for p in ROOT.glob('*-result.json')];starts=list(ROOT.glob('*-started.json'))
  require(len(results)==len(starts) and all(r['accepted'] and r['directChildReaped'] and absent(r['childPid']) for r in results),'previous incomplete/failed/active child')
  require(elapsed+182<=m['maxSeconds'],'cumulative deadline')
  token=secrets.token_hex(16);write_new(ROOT/(name+'-started.json'),{'manifestHash':a.manifest_sha,'parentPid':os.getpid(),'token':token,'at':time.time(),'chargedBefore':elapsed,'stage':name,'reservationHash':sha(ROOT/'reservation.json')})
  started=time.monotonic();r=supervise([sys.executable,str(Path(__file__).with_name('worker.py')),name,'--manifest-sha',a.manifest_sha],ROOT/(name+'-heartbeat.json'),180,env={**os.environ,'MEMORY_RUN_TOKEN':token,'PYTHONDONTWRITEBYTECODE':'1'})
  r.update(stage=name,manifestHash=a.manifest_sha,startedHash=sha(ROOT/(name+'-started.json')),reservationHash=sha(ROOT/'reservation.json'),endedAt=time.time());r['chargedSeconds']=time.monotonic()-started;elapsed+=r['chargedSeconds'];r['pidAbsent']=r['directChildReaped'] and absent(r['childPid'])
  complete=ROOT/(name+'-complete.json');r['accepted']=r['returncode']==0 and r['error'] is None and r['pidAbsent'] and complete.exists() and not (ROOT/(name+'-fatal.json')).exists() and elapsed<=m['maxSeconds']
  if r['accepted']:
   check_manifest(a.manifest_sha);done=read(complete);require(done['manifestHash']==a.manifest_sha,'complete manifest');r['completeHash']=sha(complete)
  write_new(ROOT/(name+'-result.json'),r);require(r['accepted'],'HALT; reservation consumed; no retry')
  print(name+' complete '+str(r['chargedSeconds']),flush=True)
 write_new(ROOT/'run-complete.json',{'manifestHash':a.manifest_sha,'reservationHash':sha(ROOT/'reservation.json'),'directions':m['directions'],'chargedSeconds':elapsed,'results':{name:sha(ROOT/(name+'-result.json')) for name in m['chunks']}})
finally:lock.rmdir()
