"""Local, pinned E5 index encoding. Does not read or change graph coordinates."""
import argparse
import hashlib
import json
import os
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('input')
parser.add_argument('--output', required=True)
parser.add_argument('--check-input-only', action='store_true')
args = parser.parse_args()
packet = json.loads(Path(args.input).read_text())
model_info = json.loads(Path(__file__).with_name('projection-recipe.json').read_text())['model']
expected = dict(**model_info, algorithm='index-subject-claim-question-chunk480-weighted-mean-l2-v1', chunkTokens=480)
if packet['recipe'] != expected:
    raise ValueError('Incompatible retrieval encoder recipe')
ids = set()
for row in packet['entries']:
    if not isinstance(row['text'], str) or not row['text'].strip() or row['id'] in ids:
        raise ValueError('Invalid retrieval embedding input')
    ids.add(row['id'])
    encoded_text = json.dumps(row['text'], ensure_ascii=False, separators=(',', ':')).encode()
    if hashlib.sha256(encoded_text).hexdigest() != row['textHash']:
        raise ValueError('Incorrect index textHash')
if args.check_input_only:
    print('Valid encoder input:', len(ids))
    raise SystemExit(0)

os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
import torch
from transformers import AutoTokenizer, AutoModel
from semantic_projection import chunk_ranges, pool_chunks

torch.set_num_threads(4)
torch.manual_seed(0)
old = {}
output = Path(args.output)
if output.exists():
    previous = json.loads(output.read_text())
    if previous.get('recipe') == expected:
        old = {e['id']: e for e in previous['entries']}
tokenizer = model = None
entries = []
for row in packet['entries']:
    previous = old.get(row['id'])
    if previous and previous.get('textHash') == row['textHash']:
        # Caller verifies dimensions, normalization and full chunk coverage before publication.
        entries.append(previous)
        continue
    if tokenizer is None:
        options = dict(revision=model_info['revision'], trust_remote_code=False, local_files_only=True)
        tokenizer = AutoTokenizer.from_pretrained(model_info['id'], **options)
        model = AutoModel.from_pretrained(model_info['id'], use_safetensors=True, **options).eval()
        prefix = tokenizer(model_info['prefix'].rstrip(), add_special_tokens=False)['input_ids']
    tokens = tokenizer(row['text'], add_special_tokens=False)['input_ids']
    ranges = chunk_ranges(len(tokens))
    vectors = []
    with torch.inference_mode():
        for start, end in ranges:
            batch = tokenizer.prepare_for_model(prefix + tokens[start:end], return_tensors='pt', return_attention_mask=True)
            batch = {key: value.unsqueeze(0) for key, value in batch.items()}
            if batch['input_ids'].shape[1] > 512:
                raise ValueError('Index chunk exceeds model limit')
            hidden = model(**batch).last_hidden_state
            mask = batch['attention_mask'].unsqueeze(-1)
            vectors.append(((hidden * mask).sum(1) / mask.sum(1))[0].numpy())
    vector = pool_chunks(vectors, [end-start for start, end in ranges])
    entries.append(dict(id=row['id'], textHash=row['textHash'], vector=vector.round(7).tolist(), tokens=len(tokens), chunks=len(ranges), ranges=ranges))
    print('Encoded index:', row['id'], len(tokens), flush=True)
stage = output.with_suffix(output.suffix + '.stage')
stage.write_text(json.dumps(dict(recipe=expected, entries=entries), ensure_ascii=False, separators=(',', ':')) + '\n')
stage.replace(output)
