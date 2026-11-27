import handler from '@tanstack/react-start/server-entry';
import {handleMusic,type MusicEnv} from './music/http.server';
export {MusicStore} from './music/MusicStore.server';
export default {
 async fetch(request:Request,env:MusicEnv){return await handleMusic(request,env)??handler.fetch(request);},
};
