/** Screen-space ambiguity only: semantic coordinates and graph membership stay unchanged. */
export function touchTargets<T extends {id:string;kind:string;x:number;y:number}>(items:readonly T[], point:{x:number;y:number}, radius=22):T[] {
  return items.filter(p=>Math.hypot(p.x-point.x,p.y-point.y)<=radius)
    .sort((a,b)=>Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y)||a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id));
}
