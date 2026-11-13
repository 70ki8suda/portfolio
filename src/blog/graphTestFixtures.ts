import {createHash} from 'node:crypto';
import {MODEL,ALGORITHM,type prepareGraph,type VectorCache} from '../../scripts/graph-pipeline';
import {INTERPOLATION,PROJECTION_RECIPE} from '../../scripts/semantic-cache';
export function fakeCache(prepared:ReturnType<typeof prepareGraph>):VectorCache {
 const vector=[1,...Array(383).fill(0)];
 const recipe=PROJECTION_RECIPE;const body=recipe+'\n'+INTERPOLATION+'\nref|'+vector.map(x=>x.toFixed(7)).join(',')+'|0.0000000,0.0000000';
 const entry=(n:{id:string;textHash:string})=>({...n,vector:[...vector],x:0,y:0,chunks:1,tokens:1,ranges:[[0,1]] as [number,number][]});
 return {model:MODEL,algorithm:ALGORITHM,entries:prepared.nodes.map(n=>entry({id:n.id,textHash:n.textHash})),articleEntries:prepared.articles.map(a=>entry({id:a.id,textHash:a.textHash})),reference:{id:createHash('sha256').update(body).digest('hex'),recipe,interpolation:INTERPOLATION,ids:['ref'],vectors:[vector],coordinates:[[0,0]]},explainedVariance:[]};
}
