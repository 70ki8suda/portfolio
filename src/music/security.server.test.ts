import {expect,it} from 'vitest';
import {seal,unseal,createOwnerVerifier,randomToken,sha256} from './security.server';
const enc=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
it('authenticated encryption rejects wrong keys and modification',async()=>{
 const key=randomToken(),box=await seal(key,{refresh:'fake-fixture'});expect(JSON.stringify(box)).not.toContain('fake-fixture');expect(await unseal(key,box)).toEqual({refresh:'fake-fixture'});
 await expect(unseal(randomToken(),box)).rejects.toThrow();await expect(unseal(key,{...box,cipher:box.cipher.slice(1)})).rejects.toThrow();expect(await sha256('a')).not.toBe(await sha256('b'));
});
it('verifies signature, owner, issuer, audience, time and fails closed for forged headers',async()=>{
 const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'test',alg:'RS256',use:'sig'};let calls=0;
 const verify=createOwnerVerifier({issuer:'https://test.cloudflareaccess.com',audience:'aud',subject:'owner'},async()=>{calls++;return new Response(JSON.stringify({keys:[jwk]}));},()=>1000000);
 const claims={iss:'https://test.cloudflareaccess.com',aud:['aud'],sub:'owner',exp:1100,iat:900,nbf:900};
 async function token(overrides:object={},header:object={alg:'RS256',kid:'test'}){const body=enc(header)+'.'+enc({...claims,...overrides});return body+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(body))).toString('base64url');}
 expect(await verify(await token())).toBe('owner');expect(calls).toBe(1);
 for(const override of [{sub:'other'},{iss:'https://evil.test'},{aud:['wrong']},{exp:1000},{nbf:1010},{exp:'1100'}])expect(await verify(await token(override))).toBeNull();
 expect(await verify(await token({}, {alg:'none',kid:'test'}))).toBeNull();expect(await verify((await token()).slice(0,-4)+'aaaa')).toBeNull();expect(await verify(null)).toBeNull();
 expect(await createOwnerVerifier({issuer:'https://evil.test',audience:'aud',subject:'owner'},async()=>{throw Error('must not fetch');})(await token())).toBeNull();
});
