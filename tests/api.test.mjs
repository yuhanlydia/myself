import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

// Exercise the actual route handler with SQLite and R2-shaped storage.
// Only Cloudflare bindings and outbound HTTP are replaced in this test process.
const tmp=new URL('../.test-build/',import.meta.url);mkdirSync(tmp,{recursive:true});
for(const file of ['domain','schedule','server']){let source=readFileSync(new URL('../lib/'+file+'.ts',import.meta.url),'utf8').replace("import {env} from 'cloudflare:workers';","const env=globalThis.__testEnv;").replace("from './domain'","from './domain.mjs'").replace("from './schedule'","from './schedule.mjs'");writeFileSync(new URL(file+'.mjs',tmp),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);}
const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../drizzle/0000_open_the_hood.sql',import.meta.url),'utf8'));
const DB={prepare(sql){let values=[];const query={bind(...args){values=args;return query;},async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values)};},async run(){const result=db.prepare(sql).run(...values);return {meta:{changes:Number(result.changes)}};}};return query;},async batch(queries){return Promise.all(queries.map(q=>q.run()));}};
const objects=new Map(),BUCKET={async put(key,value){objects.set(key,new Uint8Array(value));},async get(key){const value=objects.get(key);return value?{body:value,arrayBuffer:async()=>value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength)}:null;},async delete(key){objects.delete(key);}};
globalThis.__testEnv={DB,BUCKET};const {handle}=await import(pathToFileURL(new URL('server.mjs',tmp).pathname));
const {protectSchedule}=await import(new URL('schedule.mjs',tmp));
async function browserTools(owner,onRecords=()=>{}){
 const file=new URL('../lib/site-tools.ts',import.meta.url);
 assert.ok(existsSync(file),'the website must expose real ChatGPT read/write tools');
 const source=readFileSync(file,'utf8').replace("from './domain'","from './domain.mjs'");
 writeFileSync(new URL('site-tools.mjs',tmp),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
 const {createSiteTools}=await import(new URL('site-tools.mjs',tmp));
 return createSiteTools({async api(path,options={}){const r=await request(path,options.method||'GET',options.body?JSON.parse(options.body):undefined,owner);if(r.status>=400)throw Error(r.data.error);return r.data;},onRecords,openToday:()=>{}});
}
test('website tools read current records, publish saved state, and reject stale or invented data',async()=>{
 let visible=[];const owner='tool-alice',tools=await browserTools(owner,r=>{visible=r;}),call=(name,input)=>tools.find(t=>t.name===name).execute(input);
 const saved=await call('myself_save_memory',{id:'memory-one',revision:0,data:{title:'工作习惯',content:'喜欢早晨写作',role:'work',type:'preference',source:'用户明确要求记住'}});
 assert.equal(saved.record.data.content,'喜欢早晨写作');assert.ok(visible.some(r=>r.id==='memory-one'));
 const context=await call('myself_read_context',{sections:['memory']});assert.equal(context.sections.memory.records[0].data.content,'喜欢早晨写作');
 await assert.rejects(call('myself_save_memory',{id:'memory-one',revision:0,data:{title:'旧写入',content:'覆盖'}}));
 await assert.rejects(call('myself_save_checkin',{date:'2026-10-01',mood:99}));
 const other=await browserTools('tool-bob');assert.equal((await other.find(t=>t.name==='myself_read_context').execute({sections:['memory']})).sections.memory.records.length,0);
});
test('website tools save a profile, check-in, task completion and selected exchange without enabling model consent',async()=>{
 const owner='tool-workflow',tools=await browserTools(owner),call=(name,input)=>tools.find(t=>t.name===name).execute(input);
 const saved=await call('myself_update_profile',{revision:0,changes:{name:'小林',start:'08:00',end:'20:00'}});
 assert.equal(saved.record.data.name,'小林');assert.equal(saved.record.data.aiConsent,false);
 await assert.rejects(call('myself_update_profile',{revision:1,changes:{aiConsent:true}}));
 await call('myself_save_checkin',{id:'checkin:2026-10-01',revision:0,data:{date:'2026-10-01',mood:3,energy:4,sleep:7.5,movement:null,note:'完成初稿'}});
 const tasks=await call('myself_create_tasks',{requestId:crypto.randomUUID(),tasks:[task]});
 await call('myself_set_task_done',{id:tasks.records[0].id,revision:1,done:true});
 await call('myself_save_exchange',{requestId:crypto.randomUUID(),userText:'把初稿完成记录下来',assistantText:'初稿完成已记录。'});
 const context=await call('myself_read_context',{sections:['profile','checkin','task','message'],date:'2026-10-01'});
 assert.equal(context.sections.profile.records[0].data.aiConsent,undefined);
 assert.equal(context.sections.checkin.records[0].data.sleep,7.5);
 assert.equal(context.sections.task.records[0].data.done,true);
 assert.equal(context.sections.message.records.length,2);
});
const profile={name:'测试用户',roles:'研究者',goals:'完成论文',health:'保持规律',appearance:'舒服的穿搭',start:'09:00',end:'20:00',tone:'gentle',aiConsent:false};
const task={title:'写作',role:'work',date:'2026-10-01',duration:60,priority:3,time:'10:00',notes:'',done:false};
async function request(path,method='GET',data,owner='alice',extra={}){const headers={'oai-authenticated-user-id':owner,'origin':'https://test.example',...extra};if(!owner)delete headers['oai-authenticated-user-id'];const body=data instanceof FormData?data:data===undefined?undefined:JSON.stringify(data);if(body&&!(data instanceof FormData))headers['content-type']='application/json';const r=await handle(new Request('https://test.example/api/'+path,{method,headers,body}));return {status:r.status,data:(r.headers.get('content-type')||'').includes('json')?await r.json():await r.arrayBuffer(),headers:r.headers};}
test('ChatGPT task batches preserve appointments, retry safely, and isolate accounts',async()=>{
 const owner='bridge-alice',requestId=crypto.randomUUID();
 await request('records','PUT',{id:'existing',kind:'task',data:task},owner);
 const input={requestId,tasks:[{...task,title:'散步',time:'10:30',role:'health'},{...task,title:'整理笔记',time:'12:00'}]};
 const out=await request('assistant/tasks','POST',input,owner);
 assert.equal(out.status,200);assert.equal(out.data.records.length,2);
 assert.equal(out.data.records[0].data.time,'');assert.equal(out.data.records[1].data.time,'12:00');
 const retry=await request('assistant/tasks','POST',input,owner);
 assert.deepEqual(retry.data.records.map(r=>r.id),out.data.records.map(r=>r.id));
 assert.equal((await request('bootstrap','GET',undefined,owner)).data.records.filter(r=>r.kind==='task').length,3);
 assert.equal((await request('bootstrap','GET',undefined,'bridge-bob')).data.records.length,0);
 assert.equal((await request('assistant/tasks','POST',{...input,tasks:[task,{...task,date:'2026-02-30'}]},owner)).status,400);
 assert.equal((await request('assistant/tasks','POST',input,'')).status,401);
 assert.equal((await request('assistant/tasks','POST',input,owner,{origin:'https://evil.example'})).status,403);
});
test('ChatGPT exchanges persist together without a model key and cannot overwrite on retry',async()=>{
 const owner='exchange-alice',requestId=crypto.randomUUID(),input={requestId,userText:'今天完成了初稿',assistantText:'已经迈出了一步。'};
 const out=await request('assistant/exchange','POST',input,owner);assert.equal(out.status,200);
 const retry=await request('assistant/exchange','POST',{...input,assistantText:'overwrite'},owner);assert.equal(retry.status,200);
 const rows=(await request('bootstrap','GET',undefined,owner)).data.records;
 assert.equal(rows.length,2);assert.equal(rows.find(r=>r.data.role==='assistant').data.text,'已经迈出了一步。');
 assert.equal((await request('bootstrap','GET',undefined,'exchange-bob')).data.records.length,0);
});
test('anonymous users and cross-site mutations are rejected',async()=>{assert.equal((await request('bootstrap','GET',undefined,'')).status,401);assert.equal((await request('records','PUT',{},'alice',{origin:'https://evil.example'})).status,403);});
test('profile persists and records are isolated by owner',async()=>{const saved=await request('records','PUT',{id:'profile',kind:'profile',data:profile,revision:0});assert.equal(saved.status,200);assert.equal((await request('bootstrap')).data.records[0].data.name,'测试用户');assert.equal((await request('bootstrap','GET',undefined,'bob')).data.records.length,0);assert.equal((await request('records/profile','DELETE',undefined,'bob')).status,404);});
test('stale updates cannot overwrite newer data',async()=>{const stale=await request('records','PUT',{id:'profile',kind:'profile',data:{...profile,name:'stale'},revision:0});assert.equal(stale.status,409);assert.equal((await request('bootstrap')).data.records[0].data.name,'测试用户');});
test('invalid calendar date and overnight tasks fail validation',async()=>{assert.equal((await request('records','PUT',{id:'bad',kind:'task',data:{...task,date:'2026-02-30'},revision:0})).status,400);assert.equal((await request('records','PUT',{id:'bad',kind:'task',data:{...task,time:'23:45'},revision:0})).status,400);});
let photo;
test('photos require a supported signature and cannot be read by another user',async()=>{const invalid=new FormData();invalid.set('file',new File(['<svg>'],'x.jpg',{type:'image/jpeg'}));invalid.set('date','2026-10-01');assert.equal((await request('photos','POST',invalid)).status,400);const valid=new FormData();valid.set('file',new File([new Uint8Array([255,216,255,0,1])],'x.jpg',{type:'image/jpeg'}));valid.set('date','2026-10-01');const out=await request('photos','POST',valid);assert.equal(out.status,200);photo=out.data.record;assert.equal(photo.data.key,undefined);assert.equal((await request('photos/'+photo.id)).status,200);assert.equal((await request('photos/'+photo.id,'GET',undefined,'bob')).status,404);assert.match((await request('photos/'+photo.id)).headers.get('cache-control'),/no-store/);});
const chatId=crypto.randomUUID();
test('unconfigured AI saves the message without fabricating a response',async()=>{const out=await request('chat','POST',{id:chatId,text:'陪我聊聊',date:'2026-10-01',photoIds:[photo.id]});assert.equal(out.status,200);assert.equal(out.data.aiReady,false);const entries=(await request('bootstrap')).data.records;assert.equal(entries.filter(r=>r.kind==='message').length,1);assert.equal(entries.find(r=>r.id===chatId).data.role,'user');});
test('AI data sharing requires consent',async()=>{globalThis.__testEnv.OPENAI_API_KEY='test-placeholder';const out=await request('chat','POST',{id:chatId,text:'陪我聊聊',date:'2026-10-01'});assert.equal(out.data.needsConsent,true);});
test('structured model response creates tasks, keeps memories optional and is idempotent',async()=>{await request('records','PUT',{id:'profile',kind:'profile',data:{...profile,aiConsent:true},revision:1});const priorFetch=globalThis.fetch;let calls=0;globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');const payload=JSON.parse(options.body);assert.equal(payload.store,false);assert.equal(payload.input.at(-1).content.some(c=>c.type==='input_image'),false);return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({reply:'这是你可以调整的计划。',tasks:[task],memories:[{title:'规律作息',content:'希望规律生活',role:'health',type:'preference',source:'对话'}]})}]}]});};try{const input={id:chatId,text:'陪我聊聊',date:'2026-10-01',mode:'plan',photoIds:[photo.id],analyzePhotos:false};assert.equal((await request('chat','POST',input)).status,200);assert.equal((await request('chat','POST',input)).status,200);assert.equal(calls,1);const entries=(await request('bootstrap')).data.records;assert.equal(entries.filter(r=>r.kind==='task').length,1);assert.equal(entries.filter(r=>r.kind==='memory').length,0);assert.equal(entries.filter(r=>r.kind==='message'&&r.data.role==='assistant').length,1);}finally{globalThis.fetch=priorFetch;}});
test('model suggested fixed times cannot introduce new overlaps or exceed the available day',()=>{const existing=[{kind:'task',data:task}];const out=protectSchedule([{...task,time:'10:30'},{...task,time:'22:00'},{...task,time:'12:00'},{...task,time:'12:30'}],existing,profile);assert.deepEqual(out.map(t=>t.time),['','','12:00','']);assert.ok(out.every(t=>t.done===false));});
test('photo deletion removes private bytes and references from messages',async()=>{assert.equal((await request('records/'+photo.id,'DELETE')).status,200);assert.equal(objects.size,0);const entries=(await request('bootstrap')).data.records;assert.deepEqual(entries.find(r=>r.id===chatId).data.photoIds,[]);assert.equal((await request('photos/'+photo.id)).status,404);});
test('delete all is restricted to the current owner',async()=>{await request('records','PUT',{id:'profile',kind:'profile',data:profile,revision:0},'bob');assert.equal((await request('everything','DELETE')).status,200);assert.equal((await request('bootstrap')).data.records.length,0);assert.equal((await request('bootstrap','GET',undefined,'bob')).data.records.length,1);});
process.on('exit',()=>{db.close();rmSync(tmp,{recursive:true,force:true});});
