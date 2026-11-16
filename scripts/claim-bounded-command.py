"""Bound a local preprocessing command without importing its model in the parent."""
import argparse,json,sys,os
from pathlib import Path
sys.path.insert(0,str(Path(__file__).with_name('claim-rerank')))
from supervisor import supervise
p=argparse.ArgumentParser();p.add_argument('--result',required=True);p.add_argument('--seconds',type=int,required=True);p.add_argument('command',nargs=argparse.REMAINDER);a=p.parse_args()
if not a.command or not 1<=a.seconds<=600:raise ValueError('bounded local command required')
path=Path(a.result)
if path.exists():raise ValueError('Preserve prior command result')
r=supervise(a.command,path.with_suffix('.unused-heartbeat'),a.seconds,env=os.environ.copy(),initial_grace=a.seconds)
with path.open('x') as f:json.dump(r,f,indent=2);f.write('\n')
if r['error'] or r['returncode']!=0 or not r['directChildReaped']:raise SystemExit('Local command failed; results preserved')
