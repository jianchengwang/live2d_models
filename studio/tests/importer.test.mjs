import test from 'node:test';import assert from 'node:assert/strict';
import {readZip,safePath,crc32,makePackage,textureDimensions} from '../../v2/importer.js';
// Synthetic bytes test archive parsing only; they never represent Core-accepted moc3.
function zip(entries){
 const local=[],central=[];let offset=0;
 for(const [name,raw,attrs=0] of entries){const n=new TextEncoder().encode(name),data=new Uint8Array(raw),a=new Uint8Array(30+n.length+data.length),v=new DataView(a.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint32(14,crc32(data),true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,n.length,true);a.set(n,30);a.set(data,30+n.length);local.push(a);const b=new Uint8Array(46+n.length),w=new DataView(b.buffer);w.setUint32(0,0x02014b50,true);w.setUint16(4,0x314,true);w.setUint16(6,20,true);w.setUint32(16,crc32(data),true);w.setUint32(20,data.length,true);w.setUint32(24,data.length,true);w.setUint16(28,n.length,true);w.setUint32(38,attrs,true);w.setUint32(42,offset,true);b.set(n,46);central.push(b);offset+=a.length;}
 const size=central.reduce((n,b)=>n+b.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);const result=new Uint8Array(offset+size+22);let at=0;for(const b of [...local,...central,end]){result.set(b,at);at+=b.length;}return result.buffer;
}
test('reject path variants, scripts, case collisions, symlinks, CRC and damaged directories before model validation',async()=>{
 for(const path of ['../evil','/evil','C:/evil','%2e%2e/evil','%252e%252e/evil','a\\evil','a//b','a/./b','a/foo.'])assert.throws(()=>safePath(path));
 for(const entries of [[['run.js',[1]]],[['A.json',[1]],['a.json',[2]]],[['link.json',[1],(0xa1ff<<16)>>>0]],[['../a.json',[1]]]])await assert.rejects(readZip(zip(entries)));
 const damaged=new Uint8Array(zip([['a.json',[1]]]));damaged[30+6]=2;await assert.rejects(readZip(damaged.buffer),/CRC/);
});
test('limits expanded size and ratio before allocating decompressed bytes',async()=>{
 const data=zip([['big.json',[1]]]),v=new DataView(data),central=39;v.setUint32(central+24,64*1024*1024,true);v.setUint32(22,64*1024*1024,true);await assert.rejects(readZip(data),/压缩比/);
});
test('reject broken model references and arbitrary binary headers',async()=>{
 const config=new TextEncoder().encode(JSON.stringify({Version:3,FileReferences:{Moc:'a.moc3',Textures:['t.png']}}));
 await assert.rejects(readZip(zip([['a.model3.json',config]])),/缺少/);
 await assert.rejects(readZip(zip([['a.model3.json',config],['a.moc3',[1]],['t.png',[1]]])),/MOC3/);
});
test('revoke all local URLs; blob package contains only supplied reachable inventory',()=>{
 const original=URL.revokeObjectURL,revoked=[];URL.revokeObjectURL=url=>{revoked.push(url);original(url);};
 try{const p=makePackage({model:{entryPath:'a.model3.json',files:[]},files:[['a.model3.json',new Uint8Array([123,125])]]});assert.match(p.model.entryUrl,/^blob:/);p.dispose();p.dispose();assert.equal(revoked.length,1);}finally{URL.revokeObjectURL=original;}
});

test('JPEG dimensions are checked before native image decode and malformed bounds fail',()=>{
 const jpeg=new Uint8Array([255,216,255,192,0,8,8,0,16,0,32,1,255,217]);assert.deepEqual(textureDimensions(jpeg),[32,16]);
 assert.throws(()=>textureDimensions(new Uint8Array([255,216,255,192,255,255])));assert.throws(()=>textureDimensions(new Uint8Array([255,216,255,217])));
});
