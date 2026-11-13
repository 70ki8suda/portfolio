/** A response file alone is not evidence that this CLI attempt completed successfully. */
export function verifyStructuredEvents(events:string):void {
 let complete=false;
 for(const line of events.split('\n').filter(Boolean)){
  const event=JSON.parse(line);
  if(event.type==='error'||event.type==='turn.failed'||event.error)throw Error('Structured AI turn failed; preserve this attempt');
  if(event.item?.type&&event.item.type!=='agent_message')throw Error('Unexpected tool call in structured AI conversion');
  if(event.type==='turn.completed')complete=true;
 }
 if(!complete)throw Error('Structured AI turn did not complete');
}

import {retrievalHash} from './retrieval-gate';
export const TRANSPORT_VERSION='completed-structured-attempt-v2';
export function makeTransportCache(key:string,response:unknown,events:string,attempt:string) {
 verifyStructuredEvents(events);if(!attempt.trim())throw Error('Missing CLI attempt');
 return {transport:TRANSPORT_VERSION,key,response,responseHash:retrievalHash(response),events,eventsHash:retrievalHash(events),attempt};
}
export function readTransportCache(value:unknown,key:string):unknown {
 if(!value||typeof value!=='object')throw Error('Invalid transport cache');
 const saved=value as ReturnType<typeof makeTransportCache>;
 if(saved.transport!==TRANSPORT_VERSION||saved.key!==key||typeof saved.attempt!=='string'||!saved.attempt.trim()||typeof saved.events!=='string'||saved.eventsHash!==retrievalHash(saved.events)||saved.responseHash!==retrievalHash(saved.response))throw Error('Missing or changed cached completion evidence');
 verifyStructuredEvents(saved.events);return saved.response;
}
