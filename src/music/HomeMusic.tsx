import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import './music.css';
const MusicGraph=lazy(()=>import('./MusicGraph'));

/** The home page mounts the music map only while it is near the viewport, so it costs nothing above the fold. */
export function HomeMusic(){
 const host=useRef<HTMLDivElement>(null);
 const [near,setNear]=useState(false);
 useEffect(()=>{
  const element=host.current;if(!element)return;
  const observer=new IntersectionObserver(([entry])=>setNear(entry.isIntersecting),{rootMargin:'200px 0px'});
  observer.observe(element);return()=>observer.disconnect();
 },[]);
 return <div ref={host} id="home-music-section" data-testid="home-music" className="music-home-host">
  {near&&<Suspense fallback={<p role="status" className="music-status" lang="ja">音楽を準備しています…</p>}><MusicGraph home/></Suspense>}
 </div>;
}
