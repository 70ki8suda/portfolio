import tempfile,json,unittest,hashlib
from pathlib import Path
import accept as gate,contracts
class AcceptanceTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);gate.ROOT=contracts.ROOT=self.root;gate.absent=lambda _:True
 def tearDown(self):self.tmp.cleanup()
 def put(self,name,value):
  (self.root/name).write_text(json.dumps(value));return contracts.sha(self.root/name)
 def fixture(self,mutate=lambda d,r:None,manifest_mutate=lambda m:None,lease_mutate=lambda l:None,samples_mutate=lambda s:None):
  chunk=[{'pairId':'pair','direction':i,'tokens':3,'ids':[1,2,3],'tokenHash':contracts.token_hash([1,2,3])} for i in [0,1]]
  self.put('chunk-0001.json',chunk);self.put('prepared.json',chunk)
  self.put('input.json',{'pairs':[{'id':'pair'}]});self.put('model-inventory.json',{})
  bound=[self.root/n for n in ['input.json','model-inventory.json','chunk-0001.json','prepared.json']]+[Path(contracts.__file__).with_name(n) for n in ['contracts.py','prepare.py','run.py','worker.py','supervisor.py','accept.py']]
  m={'version':1,'maxDirections':12000,'maxSeconds':3600,'directions':2,'chunks':['chunk-0001'],'files':{str(p.resolve()):contracts.sha(p) for p in bound}};manifest_mutate(m);self.manifest=self.put('manifest.json',m)
  reservation=self.put('reservation.json',{'manifestHash':self.manifest,'reserved':2,'retry':0})
  l={'manifestHash':self.manifest,'stage':'chunk-0001','reservationHash':reservation,'parentPid':1,'token':'a'*32,'at':1,'chargedBefore':0};lease_mutate(l);lease=self.put('chunk-0001-started.json',l)
  rows=[{**r,'score':0} for r in chunk];(self.root/'chunk-0001-rows.jsonl').write_text('\n'.join(json.dumps(r) for r in rows)+'\n');samples=[dict(label=label,status='ok',pid=999999,current=2,mps=3,rssPeak=4,rssCurrent=3,sum=7,time=2+i,elapsed=.1+i*.1) for i,label in enumerate(['baseline','before','forward','release'])];samples_mutate(samples);(self.root/'chunk-0001-samples.jsonl').write_text('\n'.join(json.dumps(s) for s in samples)+'\n')
  d={'manifestHash':self.manifest,'reservationHash':reservation,'startedHash':lease,'stage':'chunk-0001','pid':999999,'chunkHash':contracts.sha(self.root/'chunk-0001.json'),'rowsHash':contracts.sha(self.root/'chunk-0001-rows.jsonl'),'samplesHash':contracts.sha(self.root/'chunk-0001-samples.jsonl'),'elapsed':1,'peakConservativeBytes':10,'lastRelease':samples[-1],'baseline':samples[0],'directions':2}
  r={'accepted':True,'returncode':0,'error':None,'directChildReaped':True,'pidAbsent':True,'childPid':999999,'manifestHash':self.manifest,'reservationHash':reservation,'startedHash':lease,'chargedSeconds':1}
  mutate(d,r);r['completeHash']=self.put('chunk-0001-complete.json',d);rh=self.put('chunk-0001-result.json',r)
  self.put('run-complete.json',{'manifestHash':self.manifest,'reservationHash':reservation,'directions':2,'chargedSeconds':r['chargedSeconds'],'results':{'chunk-0001':rh}})
 def test_complete(self):
  self.fixture();self.assertEqual(len(gate.accept(self.manifest)['rows']),2)
 def test_invalid_complete(self):
  mutations=[lambda d,r:d.update(elapsed=0),lambda d,r:d.update(elapsed=-1),lambda d,r:d.update(elapsed=181),lambda d,r:d.update(peakConservativeBytes=17*1024**3),lambda d,r:d.update(lastRelease={'current':20*1024**2}),lambda d,r:d.update(pid=1),lambda d,r:d.update(directions=1),lambda d,r:d.update(chunkHash='0'*64),lambda d,r:r.update(directChildReaped=False),lambda d,r:r.update(error='failure'),lambda d,r:r.update(chargedSeconds=183)]
  for mutate in mutations:
   with self.subTest(mutate=mutate):
    self.fixture(mutate)
    with self.assertRaises((ValueError,KeyError)):gate.accept(self.manifest)
 def test_required_contracts(self):
  for mutate in [lambda m:m.update(files={}),lambda m:m.update(directions=True),lambda m:m.update(directions=12001),lambda m:m.update(chunks=['chunk-0001','chunk-0001'])]:
   self.fixture(manifest_mutate=mutate)
   with self.assertRaises(ValueError):gate.accept(self.manifest)
  for mutate in [lambda l:l.update(token=''),lambda l:l.update(parentPid=True),lambda l:l.update(chargedBefore=1),lambda l:l.update(reservationHash='0'*64)]:
   self.fixture(lease_mutate=mutate)
   with self.assertRaises(ValueError):gate.accept(self.manifest)
  for mutate in [lambda s:s[0].update(current=-1),lambda s:s[0].update(current=True),lambda s:s[1].update(label='missing'),lambda s:s[2].update(elapsed=0),lambda s:s[2].update(time=1)]:
   self.fixture(samples_mutate=mutate)
   with self.assertRaises(ValueError):gate.accept(self.manifest)
 def test_original_file_drift(self):
  self.fixture();self.put('prepared.json',[])
  with self.assertRaises(ValueError):gate.accept(self.manifest)
 def test_live_or_fatal_child(self):
  self.fixture();gate.absent=lambda _:False
  with self.assertRaises(ValueError):gate.accept(self.manifest)
  gate.absent=lambda _:True;self.put('chunk-0001-fatal.json',{'failure':'retained'})
  with self.assertRaises(ValueError):gate.accept(self.manifest)
if __name__=='__main__':unittest.main()
