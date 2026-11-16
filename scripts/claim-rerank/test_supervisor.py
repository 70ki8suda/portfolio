import unittest,tempfile,sys,json,os
from pathlib import Path
from supervisor import supervise
class Watchdog(unittest.TestCase):
 def run_child(self,code,seconds=2):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'h.json';return supervise([sys.executable,'-c',code],p,seconds,initial_grace=1)
 def test_complete_reaped(self):
  r=self.run_child('pass');self.assertEqual(r['returncode'],0);self.assertTrue(r['directChildReaped']);self.assertIsNone(r['error'])
 def test_failure_not_success(self):
  r=self.run_child('raise SystemExit(7)');self.assertEqual(r['returncode'],7);self.assertTrue(r['directChildReaped'])
 def test_timeout_reaped(self):
  r=self.run_child('import time;time.sleep(30)',.2);self.assertIn('deadline',r['error']);self.assertTrue(r['directChildReaped'])
  with self.assertRaises(ProcessLookupError):os.kill(r['childPid'],0)
 def test_bad_observer_stops(self):
  with tempfile.TemporaryDirectory() as d:
   def bad(*args):raise RuntimeError('observer')
   r=supervise([sys.executable,'-c','import time;time.sleep(30)'],Path(d)/'h',2,rss_reader=bad)
   self.assertIn('observer',r['error']);self.assertTrue(r['directChildReaped'])
if __name__=='__main__':unittest.main()

class Optimized(unittest.TestCase):
 def test_optimized_rejects_bad_heartbeat(self):
  import subprocess
  for kind in ['pid','status','mps']:
   code="""import tempfile,sys,json
from pathlib import Path
from supervisor import supervise
with tempfile.TemporaryDirectory() as d:
 p=Path(d)/'h'
 child="import os,time,json;from pathlib import Path;p=Path("+repr(str(p))+");p.write_text(json.dumps(dict(status='ok',time=time.time(),pid=os.getpid(),mps=0)));time.sleep(30)"
 child=child.replace("pid=os.getpid()","pid=1") if KIND=='pid' else child.replace("status='ok'","status='error'") if KIND=='status' else child.replace('mps=0','mps=True')
 r=supervise([sys.executable,'-c',child],p,3)
 if not r['error'] or not r['directChildReaped']:raise RuntimeError('accepted invalid heartbeat')
 print(r['error'])
""".replace('KIND',repr(kind))
   r=subprocess.run([sys.executable,'-O','-c',code],capture_output=True,text=True,timeout=6,cwd=Path(__file__).parent)
   self.assertEqual(r.returncode,0,r.stderr);self.assertIn('ValueError',r.stdout)
