import {useEffect,useState} from 'react';
import {COMMENT_INDEX_URL,COMMENT_INDEX_MAX_BYTES,readCommentIndex,type CommentIndexState} from './commentIndex';
export function useCommentIndex(){
 const [state,setState]=useState<CommentIndexState>({state:'unknown',entries:[]});
 useEffect(()=>{
  let alive=true,busy=false;const controller=new AbortController();
  const refresh=async()=>{
   if(busy||document.visibilityState==='hidden')return;busy=true;
   try{
    const response=await fetch(COMMENT_INDEX_URL,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]),cache:'no-cache'});
    if(!response.ok||!response.body)throw new Error('Unavailable index');
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
    for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>COMMENT_INDEX_MAX_BYTES){await reader.cancel();throw new Error('Index too large');}chunks.push(value);}
    const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
    const next=await readCommentIndex(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
    if(next.state==='unknown')throw new Error('Invalid index');
    if(alive)setState(previous=>previous.generatedAt&&Date.parse(next.generatedAt!)<Date.parse(previous.generatedAt)?{...previous,state:'stale'}:next);
   }catch{if(alive)setState(previous=>({...previous,state:previous.generatedAt?'stale':'unknown'}));}
   finally{busy=false;}
  };
  void refresh();const timer=setInterval(()=>void refresh(),300000);const visibility=()=>void refresh();document.addEventListener('visibilitychange',visibility);window.addEventListener('pageshow',visibility);
  return()=>{alive=false;controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pageshow',visibility);};
 },[]);
 return state;
}
