"""Independent process watchdog. No torch/native model imports."""
import os,time,json,subprocess,signal,threading
from pathlib import Path
from contracts import require

def rss(pid,timeout):
 r=subprocess.run(['ps','-o','rss=','-p',str(pid)],capture_output=True,text=True,check=True,timeout=timeout)
 return int(r.stdout.strip())*1024

def bounded_rss(reader,pid,timeout):
 result=[];finished=threading.Event()
 def call():
  try:result.append((True,reader(pid,timeout)))
  except BaseException as e:result.append((False,e))
  finally:finished.set()
 thread=threading.Thread(target=call,daemon=True);thread.start()
 if not finished.wait(timeout):raise TimeoutError('RSS observer deadline')
 if not result[0][0]:raise result[0][1]
 return result[0][1]

def supervise(command,heartbeat,seconds,env=None,rss_reader=rss,initial_grace=60,heartbeat_grace=30):
 process=subprocess.Popen(command,env=env,start_new_session=True);started=time.monotonic();peak=0;error=None;cleanup=[];code=None;worker_event=None
 try:
  while process.poll() is None:
   now=time.monotonic()
   if now-started>seconds:raise TimeoutError('external deadline')
   info=None
   if Path(heartbeat).exists():
    info=json.loads(Path(heartbeat).read_text());worker_event=info
    require(info['status']=='ok','worker monitor failure')
    if time.time()-info['time']>heartbeat_grace:raise TimeoutError('heartbeat expired')
    require(info['pid']==process.pid,'heartbeat PID')
   elif now-started>initial_grace:raise TimeoutError('no heartbeat before heavy import deadline')
   try:current=bounded_rss(rss_reader,process.pid,min(1,max(.001,seconds-(time.monotonic()-started))))
   except Exception:
    if process.poll() is not None:break
    raise
   mps=info['mps'] if info else 0
   require(type(mps) is int and mps>=0,'MPS sample')
   peak=max(peak,current+mps)
   if peak>16*1024**3:raise MemoryError('external memory cap')
   time.sleep(.1)
 except BaseException as e:
  error=type(e).__name__+': '+str(e)
  # The child may already have self-exited after publishing its error.
  try:
   if process.poll() is None:
    try:os.killpg(process.pid,signal.SIGKILL);cleanup.append({'action':'killpg','result':'accepted'})
    except OSError as kill_error:
     cleanup.append({'action':'killpg','result':type(kill_error).__name__,'errno':kill_error.errno})
     # A race remains after poll. Reap/recheck before targeting the direct child.
     if process.poll() is None:
      try:process.kill();cleanup.append({'action':'child-kill','result':'accepted'})
      except OSError as child_error:cleanup.append({'action':'child-kill','result':type(child_error).__name__,'errno':child_error.errno})
   else:cleanup.append({'action':'poll','result':'already-exited'})
  except BaseException as cleanup_error:cleanup.append({'action':'cleanup','result':type(cleanup_error).__name__,'message':str(cleanup_error)})
 finally:
  try:code=process.wait(timeout=2)
  except subprocess.TimeoutExpired:
   cleanup.append({'action':'wait','result':'timeout'})
   error=error or 'child wait timeout' 
 return {'returncode':code,'error':error,'elapsed':time.monotonic()-started,'peakObservedSumBytes':peak,'childPid':process.pid,'workerEvent':worker_event,'cleanup':cleanup,'directChildReaped':code is not None,'processGroupGone':None}
