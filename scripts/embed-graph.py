#!/usr/bin/env python3
"""Local-only CPU embedding; the network downloads pinned weights, never sends prose."""
import argparse
import json
import os
from pathlib import Path
import numpy as np
import torch
from transformers import AutoTokenizer, AutoModel
from sklearn.decomposition import PCA

parser = argparse.ArgumentParser()
parser.add_argument('input', help='npm run graph:prepare output')
parser.add_argument('--output', default='content/graph-vectors.json')
parser.add_argument('--offline', action='store_true', help='Use already downloaded publisher files only')
args = parser.parse_args()
data = json.loads(Path(args.input).read_text())
model_info = data['model']
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
torch.set_num_threads(4)
torch.manual_seed(0)
torch.use_deterministic_algorithms(True)
options = dict(revision=model_info['revision'], trust_remote_code=False, local_files_only=args.offline)
tokenizer = AutoTokenizer.from_pretrained(model_info['id'], **options)
model = AutoModel.from_pretrained(model_info['id'], use_safetensors=True, **options).to('cpu').eval()
old = {}
if Path(args.output).exists():
    previous = json.loads(Path(args.output).read_text())
    if previous.get('model') == model_info and previous.get('algorithm') == data['algorithm']:
        old = {e['id']: e for e in previous['entries']}
entries = []
encoded = 0
for i, node in enumerate(data['nodes']):
    prior = old.get(node['id'])
    if prior and prior['textHash'] == node['textHash']:
        entries.append(prior)
        continue
    ids = tokenizer(node['text'], add_special_tokens=False)['input_ids']
    # The 512-token model limit includes prefix and special tokens. Split by token
    # IDs and preserve every token; token-count weighted mean avoids truncating tails.
    prefix = tokenizer(model_info['prefix'].rstrip(), add_special_tokens=False)['input_ids']
    chunks = [ids[j:j+480] for j in range(0,len(ids),480)] or [[]]
    vectors = []
    with torch.inference_mode():
        for part in chunks:
            batch = tokenizer.prepare_for_model(prefix + part, return_tensors='pt', return_attention_mask=True)
            batch = {k:v.unsqueeze(0) for k,v in batch.items()}
            hidden = model(**batch).last_hidden_state
            mask = batch['attention_mask'].unsqueeze(-1)
            vector = (hidden * mask).sum(dim=1) / mask.sum(dim=1)
            vectors.append(torch.nn.functional.normalize(vector,p=2,dim=1)[0].numpy())
    vector = np.average(vectors, axis=0, weights=[max(1,len(c)) for c in chunks])
    vector /= np.linalg.norm(vector)
    entries.append(dict(id=node['id'],textHash=node['textHash'],vector=vector.round(7).tolist(),chunks=len(chunks)))
    encoded += 1
    if encoded % 25 == 0:
        print(f'{i+1}/{len(data["nodes"])} paragraphs, {encoded} locally encoded', flush=True)
if len(entries) < 2:
    positions = np.zeros((len(entries),2))
    variance = [0.0,0.0]
else:
    matrix = np.array([e['vector'] for e in entries],dtype=np.float64)
    pca = PCA(n_components=2,svd_solver='full')
    positions = pca.fit_transform(matrix)
    # Sign convention independent of incidental SVD orientation.
    for axis in range(2):
        pivot = np.argmax(np.abs(pca.components_[axis]))
        if pca.components_[axis,pivot]<0:
            positions[:,axis] *= -1
    variance = np.nan_to_num(pca.explained_variance_ratio_,nan=0).round(6).tolist()
span = np.ptp(positions,axis=0) if len(entries) else np.ones(2)
positions = (positions-positions.min(axis=0))/np.where(span>1e-12,span,1) if len(entries) else positions
for entry,pos in zip(entries,positions):
    entry.update(x=round(float(pos[0]),6),y=round(float(pos[1]),6))
output = dict(model=model_info,algorithm=data['algorithm'],entries=entries,explainedVariance=variance)
Path(args.output).write_text(json.dumps(output,ensure_ascii=False,separators=(',',':'))+'\n')
print(f'{len(entries)} vectors, {encoded} encoded / {len(entries)-encoded} cached; PCA variance {variance}; {args.output}')
