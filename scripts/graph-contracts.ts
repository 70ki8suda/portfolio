import {readFileSync,readdirSync} from 'node:fs';
import {dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest} from './graph-corpus';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
/** Read bytes on every call: loaded module constants cannot detect mid-run contract edits. */
export function readGraphContracts():Record<string,string> {
 const paths=[join(root,'package.json'),join(root,'package-lock.json')];
 function walk(directory:string){for(const e of readdirSync(directory,{withFileTypes:true})){const path=join(directory,e.name);if(e.isDirectory())walk(path);else if(/\.(?:ts|tsx|py|json|txt)$/.test(e.name)&&!e.name.endsWith('.test.ts'))paths.push(path);}}
 walk(join(root,'scripts'));walk(join(root,'src/blog'));
 return Object.fromEntries(paths.sort().map(path=>[relative(root,path),digest(readFileSync(path,'utf8'))]));
}
