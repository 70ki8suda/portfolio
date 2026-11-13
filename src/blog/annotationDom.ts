import type {AnnotationParagraph,AnnotationRange,AnnotationSegment} from './commentAnnotations';
export function annotationParagraphs(root:HTMLElement):AnnotationParagraph[]{
 return Array.from(root.querySelectorAll<HTMLParagraphElement>('p[id^="p-"]')).map(p=>({anchor:p.id,text:p.textContent??''}));
}
function paragraphFor(root:HTMLElement,node:Node){
 const element=node.nodeType===Node.ELEMENT_NODE?node as Element:node.parentElement;
 const p=element?.closest<HTMLParagraphElement>('p[id^="p-"]');return p&&root.contains(p)?p:null;
}
export function selectedAnnotationRanges(root:HTMLElement,selection:Selection):AnnotationRange[]{
 if(selection.isCollapsed||selection.rangeCount!==1)return [];
 const range=selection.getRangeAt(0),start=paragraphFor(root,range.startContainer),end=paragraphFor(root,range.endContainer);
 if(!start||!end)return [];
 if(range.cloneContents().querySelector('h1,h2,h3,h4,h5,h6,table,pre,img,iframe,button,select,textarea'))throw new Error('本文の段落だけを選んでください。');
 const all=Array.from(root.querySelectorAll<HTMLParagraphElement>('p[id^="p-"]')),first=all.indexOf(start),last=all.indexOf(end);
 if(first<0||last<first)return [];
 return all.slice(first,last+1).map(p=>{
  let from=0,to=p.textContent?.length??0;
  if(p===start){const before=document.createRange();before.selectNodeContents(p);before.setEnd(range.startContainer,range.startOffset);from=before.toString().length;}
  if(p===end){const before=document.createRange();before.selectNodeContents(p);before.setEnd(range.endContainer,range.endOffset);to=before.toString().length;}
  return {anchor:p.id,start:from,end:to};
 });
}
export function annotationRange(root:HTMLElement,segment:AnnotationSegment):Range|null{
 const p=Array.from(root.querySelectorAll<HTMLElement>('p[id^="p-"]')).find(p=>p.id===segment.anchor);if(!p)return null;
 const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT),range=document.createRange();let offset=0,start=false,end=false;
 while(walker.nextNode()){
  const node=walker.currentNode,length=node.textContent?.length??0;
  if(!start&&segment.start>=offset&&segment.start<=offset+length){range.setStart(node,segment.start-offset);start=true;}
  if(segment.end>=offset&&segment.end<=offset+length){range.setEnd(node,segment.end-offset);end=true;break;}
  offset+=length;
 }
 return start&&end?range:null;
}
