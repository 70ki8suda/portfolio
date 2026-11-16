import os,sys,time,json,threading,resource,subprocess,argparse,traceback
from contracts import *
p=argparse.ArgumentParser();p.add_argument('chunk',type=str);p.add_argument('--manifest-sha',required=True);a=p.parse_args()
manifest=check_manifest(a.manifest_sha)
reservation=read(ROOT/'reservation.json');require(reservation['reserved']==manifest['directions'] and reservation['manifestHash']==a.manifest_sha,'reservation')
lease=read(ROOT/(a.chunk+'-started.json'));require(a.chunk in manifest['chunks'],'unknown chunk');require(lease['parentPid']==os.getppid() and lease['token']==os.environ.get('MEMORY_RUN_TOKEN'),'parent lease')
chunk=read(ROOT/(a.chunk+'.json'));require(0<len(chunk)<=128,'chunk bound')
start=time.monotonic();lock=threading.RLock();stop=threading.Event();stage='import';peak=0;baseline=None
out=ROOT/(a.chunk+'-rows.jsonl');heartbeat=ROOT/(a.chunk+'-heartbeat.json');fatal=ROOT/(a.chunk+'-fatal.json');samples=ROOT/(a.chunk+'-samples.jsonl')
for target in [out,heartbeat,fatal,samples,ROOT/(a.chunk+'-complete.json')]:require(not target.exists(),'preserve '+str(target))
def atomic(path,data):
 t=path.with_suffix('.partial');t.write_text(json.dumps(data));t.replace(path)
def failure(exc):
 with lock:
  event={'status':'error','time':time.time(),'pid':os.getpid(),'stage':stage,'exception':{'type':type(exc).__name__,'message':str(exc),'traceback':traceback.format_exc()}}
  atomic(fatal,event);atomic(heartbeat,event)
try:
 os.environ.update(HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1',TOKENIZERS_PARALLELISM='false')
 import torch,transformers,tokenizers
 from transformers import AutoTokenizer,AutoModelForSequenceClassification
 require((torch.__version__,transformers.__version__,tokenizers.__version__)==('2.6.0','4.51.3','0.21.4'),'runtime pin');require(torch.backends.mps.is_available(),'MPS')
 torch.set_num_threads(4);torch.manual_seed(0)
 def sample(label,persist=False):
  global peak
  with lock:
   current=torch.mps.current_allocated_memory();driver=torch.mps.driver_allocated_memory();rsspeak=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
   require(all(type(v)is int and v>=0 for v in [current,driver,rsspeak]),'sample validity')
   peak=max(peak,driver+rsspeak)
   event={'status':'ok','time':time.time(),'pid':os.getpid(),'mps':driver,'current':current,'rssPeak':rsspeak,'sum':driver+rsspeak,'stage':stage,'label':label,'elapsed':time.monotonic()-start}
   if persist:
    result=subprocess.run(['ps','-o','rss=','-p',str(os.getpid())],capture_output=True,text=True,check=True,timeout=1)
    event['rssCurrent']=int(result.stdout.strip())*1024
    with samples.open('a') as f:f.write(json.dumps(event)+'\n')
   require(peak<=16*1024**3 and time.monotonic()-start<=180,'resource cap')
   atomic(heartbeat,event);return event
 def monitor():
  while not stop.wait(.1):
   try:sample('monitor')
   except BaseException as e:
    failure(e);os._exit(75)
 threading.Thread(target=monitor,daemon=True).start()
 stage='inventory';inventory=read(ROOT/'model-inventory.json');require(inventory['revision']=='953dc6f6f85a1b2dbfca4c34a2796e7dde08d41e','revision')
 for rel,info in inventory['files'].items():require(sha(Path(inventory['path'])/rel)==info['sha256'],'model byte pin')
 tokenizer=AutoTokenizer.from_pretrained(inventory['path'],local_files_only=True,trust_remote_code=False,padding_side='right')
 packet=read(ROOT/'input.json');pairs={v['id']:v for v in packet['pairs']}
 for row in chunk:
  pair=pairs[row['pairId']];x,y=(pair['a'],pair['b']) if row['direction']==0 else (pair['b'],pair['a'])
  ids=tokenizer(packet['documents'][x]['text'],packet['documents'][y]['text'],add_special_tokens=True,truncation=False)['input_ids']
  require(ids==row['ids'] and token_hash(ids)==row['tokenHash'] and len(ids)==row['tokens']<=8192,'fresh token binding')
 stage='model load';model=AutoModelForSequenceClassification.from_pretrained(inventory['path'],torch_dtype=torch.float32,attn_implementation='eager',use_safetensors=True,local_files_only=True,trust_remote_code=False).to('mps').eval()
 torch.mps.synchronize();baseline=sample('baseline',True);rows=[]
 def forward(batch):
  global stage
  b=tokenizer.pad([{'input_ids':r['ids'],'attention_mask':[1]*len(r['ids'])} for r in batch],padding=True,return_tensors='pt')
  for i,r in enumerate(batch):require(b['input_ids'][i][b['attention_mask'][i].bool()].tolist()==r['ids'],'padding coverage')
  b=b.to('mps');stage='forward';logits=model(**b).logits;values=logits.reshape(-1).cpu().tolist();torch.mps.synchronize();sample('forward',True)
  del logits,b
  return values
 with out.open('x') as f,torch.inference_mode():
  for offset in range(0,len(chunk),4):
   stage='before';sample('before',True);batch=chunk[offset:offset+4];values=forward(batch)
   stage='release';torch.mps.synchronize();torch.mps.empty_cache();after=sample('release',True)
   require(after['current']-baseline['current']<=16*1024**2,'tensor lifetime bound')
   require(len(values)==len(batch),'batch size')
   for r,score in zip(batch,values):
    require(type(score) in (int,float) and math.isfinite(score),'score');row={k:r[k] for k in ['pairId','direction','tokens','tokenHash']};row['score']=score;rows.append(row);f.write(json.dumps(row)+'\n');f.flush()
 validate_rows(rows,chunk);require(not fatal.exists(),'fatal');check_manifest(a.manifest_sha)
 write_new(ROOT/(a.chunk+'-complete.json'),{'manifestHash':a.manifest_sha,'startedHash':sha(ROOT/(a.chunk+'-started.json')),'reservationHash':sha(ROOT/'reservation.json'),'stage':a.chunk,'chunkHash':sha(ROOT/(a.chunk+'.json')),'rowsHash':sha(out),'samplesHash':sha(samples),'directions':len(rows),'baseline':baseline,'lastRelease':after,'peakConservativeBytes':peak,'elapsed':time.monotonic()-start,'cloudCalls':0,'pid':os.getpid()})
except BaseException as e:
 failure(e);raise
finally:stop.set()
