#!/usr/bin/env python3
"""Local CPU embedding plus explicit, frozen common semantic projection."""
import argparse,json,os
from pathlib import Path
import numpy as np
import torch
from transformers import AutoTokenizer,AutoModel
from semantic_projection import chunk_ranges,pool_chunks,make_reference,validate_reference,project,vector_key
p=argparse.ArgumentParser();p.add_argument('input');p.add_argument('--output',default='content/graph-vectors.json');p.add_argument('--offline',action='store_true');p.add_argument('--refresh-projection',action='store_true');args=p.parse_args()
lock=Path('.graph-update.lock')
if lock.exists():
 owner=json.loads((lock/'owner.json').read_text())
 if not owner.get('token') or owner['token']!=os.environ.get('GRAPH_UPDATE_LOCK_TOKEN'):p.error('Graph update/build is locked')
data=json.loads(Path(args.input).read_text());info=data['model'];previous=json.loads(Path(args.output).read_text()) if Path(args.output).exists() else {}
recipe_config=json.loads((Path(__file__).with_name('projection-recipe.json')).read_text())
if recipe_config['model']!=info:raise ValueError('Embedding model does not match projection recipe')
recipe=json.dumps(recipe_config,sort_keys=True,separators=(',',':'))
reference=previous.get('reference')
if not args.refresh_projection:
 if not reference:raise ValueError('Missing projection state. Initial migration requires explicit --refresh-projection.')
 validate_reference(reference,info['dim'])
 if reference['recipe']!=recipe:raise ValueError('Incompatible projection recipe; explicit --refresh-projection required')
os.environ['HF_HUB_DISABLE_TELEMETRY']='1';torch.set_num_threads(4);torch.manual_seed(0);torch.use_deterministic_algorithms(True)
options=dict(revision=info['revision'],trust_remote_code=False,local_files_only=args.offline)
tokenizer=None;model=None;encoded=0
compatible=previous.get('model')==info and previous.get('algorithm') in [data['algorithm'],'e5-chunk480-mean-l2-pca-full-v2']
old={e['id']:e for e in previous.get('entries',[])} if compatible else {}
old_articles={e['id']:e for e in previous.get('articleEntries',[])} if compatible and reference and reference['recipe']==recipe else {}
def encode(item,prior,article=False):
 global tokenizer,model,encoded
 if prior and prior['textHash']==item['textHash']:return dict(prior)
 if tokenizer is None:
  tokenizer=AutoTokenizer.from_pretrained(info['id'],**options);model=AutoModel.from_pretrained(info['id'],use_safetensors=True,**options).to('cpu').eval()
 ids=tokenizer(item['text'],add_special_tokens=False)['input_ids'];prefix=tokenizer(info['prefix'].rstrip(),add_special_tokens=False)['input_ids'];ranges=chunk_ranges(len(ids));vectors=[]
 with torch.inference_mode():
  for start,end in ranges:
   batch=tokenizer.prepare_for_model(prefix+ids[start:end],return_tensors='pt',return_attention_mask=True);batch={k:v.unsqueeze(0) for k,v in batch.items()}
   if batch['input_ids'].shape[1]>512:raise ValueError('Token window exceeded')
   h=model(**batch).last_hidden_state;mask=batch['attention_mask'].unsqueeze(-1);vectors.append(((h*mask).sum(1)/mask.sum(1))[0].numpy())
 v=pool_chunks(vectors,[b-a for a,b in ranges]);encoded+=1
 result=dict(id=item['id'],textHash=item['textHash'],vector=v.round(7).tolist(),chunks=len(ranges))
 if article:result.update(tokens=len(ids),ranges=ranges)
 print('Encoded',item['id'],len(ids),'tokens',flush=True)
 return result
entries=[encode(n,old.get(n['id'])) for n in data['nodes']];articles=[encode(a,old_articles.get(a['id']),True) for a in data['articles']];all_entries=articles+entries
if args.refresh_projection:
 from umap import UMAP
 import umap,sklearn
 fit=recipe_config['fit']
 if umap.__version__!=fit['umap'] or sklearn.__version__!=fit['sklearn'] or np.__version__!=fit['numpy']:raise ValueError('Projection dependency versions do not match recipe')
 unique={}
 for e in sorted(all_entries,key=lambda e:e['id']):unique.setdefault(vector_key(e['vector']),e)
 refs=sorted(unique.values(),key=lambda e:e['id']);matrix=np.array([e['vector'] for e in refs],dtype=np.float64);matrix/=np.linalg.norm(matrix,axis=1,keepdims=True)
 if len(refs)<4:positions=np.column_stack([np.arange(len(refs),dtype=float),np.zeros(len(refs))])
 else:positions=UMAP(n_components=2,n_neighbors=min(fit['neighbors'],len(refs)-1),metric=fit['metric'],random_state=fit['seed'],transform_seed=fit['seed'],n_jobs=1,init=fit['init']).fit_transform(matrix)
 span=max(float(np.ptp(positions,axis=0).max()),1e-12);positions=(positions-(positions.max(0)+positions.min(0))/2)/span
 reference=make_reference([e['vector'] for e in refs],positions,[e['id']+'@'+e['textHash'] for e in refs],recipe)
positions=project(reference,[e['vector'] for e in all_entries])
for entry,xy in zip(all_entries,positions):entry.update(x=float(xy[0]),y=float(xy[1]))
output=dict(model=info,algorithm=data['algorithm'],entries=entries,articleEntries=articles,reference=reference,explainedVariance=[])
Path(args.output).write_text(json.dumps(output,ensure_ascii=False,separators=(',',':'))+'\n')
print(f'{len(entries)} paragraph vectors / {len(articles)} full article vectors; {encoded} encoded; fixed basis {reference["id"]}')
