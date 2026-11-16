"""Immutable local claim reranking batches. No model imports in this module."""
import hashlib,json,math,os
from pathlib import Path
ROOT=Path(os.environ.get('CLAIM_RUN_ROOT','/nonexistent-claim-run')).resolve()
def require(value,message):
 if not value:raise ValueError(message)
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def read(path):return json.loads(Path(path).read_text())
def write_new(path,data):
 with Path(path).open('x') as f:json.dump(data,f,ensure_ascii=False,indent=2);f.write('\n')
def check_manifest(expected):
 require(sha(ROOT/'manifest.json')==expected,'manifest hash')
 manifest=read(ROOT/'manifest.json')
 require(manifest['version']==1 and manifest['maxDirections']==12000 and manifest['maxSeconds']==3600,'budget contract')
 require(type(manifest['directions']) is int and 0<manifest['directions']<=12000,'direction budget')
 chunks=manifest['chunks'];require(isinstance(chunks,list) and len(chunks)==len(set(chunks)) and chunks and all(isinstance(n,str) and __import__('re').fullmatch(r'chunk-[0-9]{4}',n) for n in chunks),'chunk names')
 required=[ROOT/'input.json',ROOT/'model-inventory.json',ROOT/'prepared.json']+[ROOT/(n+'.json') for n in chunks]+[Path(__file__).with_name(n) for n in ['contracts.py','prepare.py','run.py','worker.py','supervisor.py','accept.py']]
 require(all(str(p.resolve()) in manifest['files'] for p in required),'required manifest files')
 for p,h in manifest['files'].items():require(sha(p)==h,'file drift: '+p)
 prepared=read(ROOT/'prepared.json');actual=[r for n in chunks for r in read(ROOT/(n+'.json'))]
 require(len(prepared)==manifest['directions'] and actual==prepared and all(0<len(read(ROOT/(n+'.json')))<=128 for n in chunks),'prepared chunk coverage')
 require(len({key(r) for r in prepared})==len(prepared),'prepared uniqueness')
 packet=read(ROOT/'input.json');pairs=packet['pairs'];require(len({p['id'] for p in pairs})==len(pairs),'pair uniqueness')
 expected={(p['id'],d) for p in pairs for d in [0,1]};require({key(r) for r in prepared}==expected,'input pair coverage')
 for r in prepared:require(type(r['direction']) is int and r['direction'] in [0,1] and isinstance(r['ids'],list) and 0<len(r['ids'])<=8192 and all(type(i) is int and i>=0 for i in r['ids']) and type(r['tokens']) is int and r['tokens']==len(r['ids']) and r['tokenHash']==token_hash(r['ids']),'prepared token contract')
 return manifest
def key(row):return row['pairId'],row['direction']
def token_hash(ids):return hashlib.sha256(json.dumps(ids,separators=(',',':')).encode()).hexdigest()
def validate_rows(rows,prepared):
 expected={key(r):r for r in prepared}
 require(len(expected)==len(prepared) and len(rows)==len(expected) and {key(r) for r in rows}==set(expected),'row coverage')
 for r in rows:
  e=expected[key(r)]
  require(type(r['direction']) is int and r['direction'] in [0,1],'direction')
  require(type(r['score']) in (int,float) and math.isfinite(r['score']),'finite score')
  require(type(r['tokens']) is int and r['tokens']==len(e['ids'])==e['tokens'] and r['tokenHash']==e['tokenHash']==token_hash(e['ids']),'token coverage')
 return {key(r):r for r in rows}
def absent(pid):
 try:os.kill(pid,0);return False
 except ProcessLookupError:return True
