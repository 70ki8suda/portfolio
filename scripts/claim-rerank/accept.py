"""Prove complete, bounded and reaped workers before exposing any scores to ranking."""
import argparse
from contracts import *
def accept(expected):
 m=check_manifest(expected);reservation=read(ROOT/'reservation.json');run=read(ROOT/'run-complete.json')
 require(reservation['manifestHash']==expected and reservation['reserved']==m['directions'] and reservation['retry']==0,'reservation')
 require(run['manifestHash']==expected and run['reservationHash']==sha(ROOT/'reservation.json') and run['directions']==m['directions'],'run identity')
 require(set(run['results'])==set(m['chunks']),'complete chunk set')
 rows=[];elapsed=0;peak=0
 for name in m['chunks']:
  result_path=ROOT/(name+'-result.json');r=read(result_path);started=ROOT/(name+'-started.json');complete=ROOT/(name+'-complete.json');done=read(complete);chunk=ROOT/(name+'.json');out=ROOT/(name+'-rows.jsonl');samples=ROOT/(name+'-samples.jsonl')
  require(sha(result_path)==run['results'][name] and r['completeHash']==sha(complete),'result hashes')
  require(r['accepted'] is True and r['returncode']==0 and r['error'] is None and r['directChildReaped'] is True and r['pidAbsent'] is True and absent(r['childPid']),'child state')
  require(not (ROOT/(name+'-fatal.json')).exists(),'fatal preserved')
  require(r['manifestHash']==done['manifestHash']==expected and r['startedHash']==done['startedHash']==sha(started),'manifest/lease')
  require(r['reservationHash']==done['reservationHash']==sha(ROOT/'reservation.json'),'worker reservation')
  lease=read(started);require(lease['manifestHash']==expected and lease['stage']==name and done['stage']==name and done['pid']==r['childPid'],'stage/PID')
  require(done['chunkHash']==sha(chunk) and done['rowsHash']==sha(out) and done['samplesHash']==sha(samples),'worker output hashes')
  for v in [r['chargedSeconds'],done['elapsed'],done['peakConservativeBytes']]:require(type(v) in (int,float) and math.isfinite(v) and v>0,'finite metrics')
  require(done['elapsed']<=180 and r['chargedSeconds']<=182 and done['peakConservativeBytes']<=16*1024**3,'worker cap')
  require(type(r['childPid']) is int and r['childPid']>0 and type(lease['parentPid']) is int and lease['parentPid']>0 and lease['parentPid']!=r['childPid'],'PID contract')
  require(lease['reservationHash']==sha(ROOT/'reservation.json') and isinstance(lease['token'],str) and __import__('re').fullmatch(r'[a-f0-9]{32}',lease['token']),'lease reservation/token')
  require(type(lease['at']) in (int,float) and math.isfinite(lease['at']) and lease['at']>0 and type(lease['chargedBefore']) in (int,float) and math.isfinite(lease['chargedBefore']) and abs(lease['chargedBefore']-elapsed)<1e-6,'lease time sequence')
  samples_rows=[json.loads(line) for line in samples.read_text().splitlines()]
  expected_labels=['baseline']+['before','forward','release']*math.ceil(done['directions']/4)
  require([s['label'] for s in samples_rows]==expected_labels and samples_rows[0]==done['baseline'] and samples_rows[-1]==done['lastRelease'],'sample coverage')
  previous_time=0;previous_elapsed=0
  for sample in samples_rows:
   require(sample['status']=='ok' and type(sample['pid']) is int and sample['pid']==r['childPid'],'sample identity')
   require(all(type(sample[k]) is int and sample[k]>=0 for k in ['current','mps','rssPeak','rssCurrent','sum']),'memory sample')
   require(sample['sum']==sample['mps']+sample['rssPeak'] and sample['sum']<=done['peakConservativeBytes'],'sample peak')
   require(all(type(sample[k]) in (int,float) and math.isfinite(sample[k]) and sample[k]>0 for k in ['time','elapsed']) and sample['time']>=previous_time and sample['elapsed']>=previous_elapsed and sample['elapsed']<=done['elapsed'],'sample time sequence')
   previous_time=sample['time'];previous_elapsed=sample['elapsed']
   if sample['label']=='release':require(sample['current']-done['baseline']['current']<=16*1024**2,'tensor lifetime')
  require(done['elapsed']<=r['chargedSeconds'] and lease['at']<=done['baseline']['time'],'worker time bounds')
  rr=[json.loads(line) for line in out.read_text().splitlines()];validate_rows(rr,read(chunk));require(done['directions']==len(rr),'complete count')
  rows.extend(rr);elapsed+=r['chargedSeconds'];peak=max(peak,done['peakConservativeBytes'])
 require(elapsed<=m['maxSeconds'] and abs(elapsed-run['chargedSeconds'])<1e-6,'cumulative time')
 validate_rows(rows,read(ROOT/'prepared.json'));require(len(rows)==m['directions'],'reserved coverage');check_manifest(expected)
 return {'manifestHash':expected,'completeHash':sha(ROOT/'run-complete.json'),'rows':rows,'chargedSeconds':elapsed,'peakConservativeBytes':peak,'cloudCalls':0}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--manifest-sha',required=True);a=p.parse_args();result=accept(a.manifest_sha);write_new(ROOT/'accepted.json',result);print('Accepted '+str(len(result['rows']))+' local directions')
