import {createHash} from 'node:crypto';
import {unified} from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import {toString} from 'mdast-util-to-string';
import type {RootContent} from 'mdast';
import {extractParagraphs} from '../src/blog/paragraphs';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export function claimSource(raw:string){
 const prefix=/^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(raw)?.[0]??'';
 const body=raw.slice(prefix.length),tree=unified().use(remarkParse).use(remarkGfm).parse(body);
 const paragraphs=extractParagraphs(tree,true);
 const sections:{id:string;title:string;path:string;anchor:string}[]=[{id:'',title:'冒頭',path:'冒頭',anchor:''}];
 const blocks:{id:string;sectionId:string;kind:string;startByte:number;endByte:number;sourceHash:string;markdownHash:string;markdown:string;text:string;anchor:string;anchorKind:'section'|'paragraph'}[]=[];
 const headings:{depth:number;title:string}[]=[];
 const sourceHash=hash(raw);let current=sections[0],lastParagraph='';
 const paragraphSection=new Map<string,string>();
 const visit=(node:RootContent)=>{
  if(node.type==='paragraph'){
   const id=node.data?.hProperties?.id;
   if(typeof id==='string'){paragraphSection.set(id,current.id);lastParagraph=id;if(!current.anchor)current.anchor=id;}
  }else if(node.type==='blockquote')node.children.forEach(visit);
 };
 for(const node of tree.children){
  if(node.type==='heading'){
   const title=toString(node),explicit=/\s+\{#([a-z][a-z0-9-]*)\}$/.exec(title)?.[1];
   while(headings.length&&headings.at(-1)!.depth>=node.depth)headings.pop();
   headings.push({depth:node.depth,title:title.replace(/\s+\{#[^}]+\}$/,'')});
   current={id:explicit??`heading-${hash(`${node.position!.start.offset}:${title}`).slice(0,16)}`,title:title.replace(/\s+\{#[^}]+\}$/,''),path:headings.map(h=>h.title).join(' / '),anchor:explicit??''};sections.push(current);
  }else if(node.type==='list'||node.type==='table'){
   const start=prefix.length+node.position!.start.offset!,end=prefix.length+node.position!.end.offset!;
   const markdown=raw.slice(start,end);
   const text=node.type==='table'?node.children.map(row=>row.children.map(cell=>toString(cell)).join(' | ')).join('\n'):node.children.map(item=>toString(item)).join('\n');
   const anchor=current.anchor||lastParagraph;
   blocks.push({id:`block-${hash(`${sourceHash}:${start}:${end}:${markdown}`).slice(0,20)}`,sectionId:current.id,kind:node.type,startByte:Buffer.byteLength(raw.slice(0,start)),endByte:Buffer.byteLength(raw.slice(0,end)),sourceHash,markdownHash:hash(markdown),markdown,text,anchor,anchorKind:anchor.startsWith('p-')?'paragraph':'section'});
  }else visit(node);
 }
 return {sourceHash,sections,paragraphs:paragraphs.map(p=>({...p,sectionId:paragraphSection.get(p.anchor)??p.sectionId??''})),blocks};
}
