import {retrievalHash} from '../../scripts/retrieval-gate';
import {expect,it} from 'vitest';
import {verifyStructuredEvents} from '../../scripts/retrieval-author-transport';
it('requires a completed turn and rejects authentication/error output even with plausible agent text',()=>{
 const agent=JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'{}'}});
 expect(()=>verifyStructuredEvents(agent)).toThrow();
 expect(()=>verifyStructuredEvents(agent+'\n'+JSON.stringify({type:'error',message:'401 unauthorized'})+'\n'+JSON.stringify({type:'turn.completed'}))).toThrow();
 expect(()=>verifyStructuredEvents('401 unauthorized')).toThrow();
 expect(()=>verifyStructuredEvents(JSON.stringify({type:'turn.failed',error:{message:'failed'}}))).toThrow();
 expect(()=>verifyStructuredEvents(agent+'\n'+JSON.stringify({type:'turn.completed'}))).not.toThrow();
});
it('rejects tool execution events in structured conversion',()=>{
 expect(()=>verifyStructuredEvents(JSON.stringify({type:'item.completed',item:{type:'command_execution'}})+'\n'+JSON.stringify({type:'turn.completed'}))).toThrow();
});
import {makeTransportCache,readTransportCache} from '../../scripts/retrieval-author-transport';
it('rejects legacy, incomplete and error-bearing cached responses, not just new output',()=>{
 const events=JSON.stringify({type:'turn.completed'}),value=makeTransportCache('key',{entries:[]},events,'attempt');
 expect(readTransportCache(value,'key')).toEqual({entries:[]});
 expect(()=>readTransportCache({key:'key',response:{entries:[]},responseHash:value.responseHash},'key')).toThrow();
 expect(()=>readTransportCache(value,'other')).toThrow();
 expect(()=>makeTransportCache('key',{},'', 'attempt')).toThrow();
 expect(()=>makeTransportCache('key',{},JSON.stringify({type:'error',message:'401'})+'\n'+events,'attempt')).toThrow();
 expect(()=>readTransportCache({...value,events:''},'key')).toThrow();
 for(const bad of ['',JSON.stringify({type:'error',message:'401'})+'\n'+events])expect(()=>readTransportCache({...value,events:bad,eventsHash:retrievalHash(bad)},'key')).toThrow();
});
