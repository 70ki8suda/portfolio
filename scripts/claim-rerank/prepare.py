"""Tokenize a new frozen local batch, never infer or overwrite prior outputs."""
import os,json,sys
from contracts import *
os.environ.update(HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1',TOKENIZERS_PARALLELISM='false')
from transformers import AutoTokenizer
packet=read(ROOT/'input.json');inventory=read(ROOT/'model-inventory.json')
require(inventory['revision']=='953dc6f6f85a1b2dbfca4c34a2796e7dde08d41e','model revision')
for name,info in inventory['files'].items():require(sha(Path(inventory['path'])/name)==info['sha256'],'model bytes')
docs=packet['documents'];pairs=packet['pairs'];require(len({p['id'] for p in pairs})==len(pairs),'unique pairs')
require(0<len(pairs)*2<=12000,'direction bound')
tokenizer=AutoTokenizer.from_pretrained(inventory['path'],local_files_only=True,trust_remote_code=False,padding_side='right')
rows=[]
for pair in pairs:
 a,b=pair['a'],pair['b'];require(a<b and a in docs and b in docs and docs[a]['slug']!=docs[b]['slug'],'pair endpoints')
 require(pair['id']==hashlib.sha256(json.dumps([a,b],ensure_ascii=False,separators=(',',':')).encode()).hexdigest(),'pair identity')
 for direction,(x,y) in enumerate([(a,b),(b,a)]):
  ids=tokenizer(docs[x]['text'],docs[y]['text'],add_special_tokens=True,truncation=False)['input_ids'];require(0<len(ids)<=8192,'no truncation allowed')
  rows.append({'pairId':pair['id'],'direction':direction,'tokens':len(ids),'tokenHash':token_hash(ids),'ids':ids})
# Stable short-length batches reduce padding. Complete pairs need not share a worker;
# publication still requires both directions from independently complete workers.
rows.sort(key=lambda r:(r['tokens'],r['pairId'],r['direction']))
write_new(ROOT/'prepared.json',rows)
chunks=[]
for offset in range(0,len(rows),128):
 name='chunk-'+str(offset//128+1).zfill(4);chunks.append(name);write_new(ROOT/(name+'.json'),rows[offset:offset+128])
paths=[ROOT/'input.json',ROOT/'model-inventory.json',ROOT/'prepared.json']+[ROOT/(c+'.json') for c in chunks]+list(Path(__file__).parent.glob('*.py'))
write_new(ROOT/'manifest.json',{'version':1,'directions':len(rows),'maxDirections':12000,'maxSeconds':3600,'chunks':chunks,'files':{str(p.resolve()):sha(p) for p in paths}})
write_new(ROOT/'preflight.json',{'directions':len(rows),'chunks':len(chunks),'totalTokens':sum(r['tokens'] for r in rows),'maxTokens':max(r['tokens'] for r in rows),'manifestHash':sha(ROOT/'manifest.json'),'cloudCalls':0,'modelForwards':0})
print(json.dumps(read(ROOT/'preflight.json')))
