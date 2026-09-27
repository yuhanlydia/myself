import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultState,emptyState,planDay,sanitizeState,validateTask,validatePrefs,dateKey,shiftDate,applyTask,nextTask} from '../lib/planner.mjs';
const now=new Date(2026,8,28,8,0), date=dateKey(now), prefs={...emptyState(now).prefs,end:'18:00'};
const task=(id,extra={})=>({id,title:'Task '+id,date,role:'work',priority:2,duration:60,time:'',done:false,notes:'',createdAt:now.toISOString(),...extra});
test('fixed appointments stay fixed and flexible tasks do not overlap them',()=>{
 const p=planDay([task('a',{time:'09:00'}),task('b'),task('c')],prefs,date,now);
 assert.equal(p.scheduled.find(t=>t.id==='a').start,540);
 for(let i=0;i<p.scheduled.length;i++)for(let j=i+1;j<p.scheduled.length;j++)assert.ok(p.scheduled[i].end<=p.scheduled[j].start||p.scheduled[j].end<=p.scheduled[i].start);
});
test('overflow never silently crosses the end of the available day',()=>{
 const p=planDay([task('a',{duration:90}),task('b',{duration:90})],{...prefs,end:'11:00'},date,now);
 assert.equal(p.scheduled.length,1);assert.equal(p.overflow.length,1);assert.ok(p.scheduled.every(t=>t.end<=660));
});
test('fixed-time conflicts are visible on both appointments',()=>{
 const p=planDay([task('a',{time:'10:00'}),task('b',{time:'10:30'})],prefs,date,now);
 assert.ok(p.scheduled.every(t=>t.conflict));
});
test('today does not schedule flexible unfinished tasks before now',()=>{
 const afternoon=new Date(2026,8,28,15,31);const p=planDay([task('a')],prefs,date,afternoon);
 assert.equal(p.scheduled[0].start,15*60+35);
});
test('priority and role weights affect flexible placement',()=>{
 const p=planDay([task('a',{priority:1}),task('b',{priority:3})],prefs,date,now);
 assert.equal(p.scheduled[0].id,'b');
 const weighted={...prefs,weights:{work:1,self:5,family:1,health:1}};
 assert.equal(planDay([task('a'),task('b',{role:'self'})],weighted,date,now).scheduled[0].id,'b');
});
test('dates roll over through a year boundary',()=>assert.equal(shiftDate('2026-12-31',1),'2027-01-01'));
test('completed tasks are not recommended',()=>{
 const p=planDay([task('a',{done:true}),task('b')],prefs,date,now);assert.equal(nextTask(p,date,now).id,'b');
});
test('invalid times, dates, durations and preference ranges are rejected',()=>{
 for(const invalid of [{duration:-5},{duration:NaN},{duration:300},{date:'2026-02-30'},{time:'25:00'},{time:'23:30',duration:60},{role:'unknown'}])assert.throws(()=>validateTask(task('a',invalid)));
 assert.throws(()=>validatePrefs({...prefs,start:'22:00',end:'08:00'}));
});
test('backup round trip retains state and rejects corrupt records',()=>{
 const s=defaultState(now);assert.deepEqual(sanitizeState(JSON.parse(JSON.stringify(s))),s);
 assert.throws(()=>sanitizeState({version:1,tasks:'bad',memories:[]}));
 assert.throws(()=>sanitizeState({...s,tasks:[task('x'),task('x')]}));
 assert.throws(()=>sanitizeState({...s,memories:[{id:'m',title:'T',content:'C',type:'wrong',role:'work'}]}));
});
test('editing a task preserves identity and does not duplicate it',()=>{
 const s={...emptyState(now),tasks:[task('a')]};const updated=applyTask(s,task('a',{title:'New title'}));
 assert.equal(updated.tasks.length,1);assert.equal(updated.tasks[0].id,'a');assert.equal(updated.tasks[0].title,'New title');
});
test('a deleted or completed task cannot retain an active focus timer after restore',()=>{
 const s={...emptyState(now),focus:{taskId:'missing',endAt:Date.now(),remaining:60,initialSeconds:60}};
 assert.equal(sanitizeState(s).focus,null);
});
