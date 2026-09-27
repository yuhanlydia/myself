export const STORAGE_KEY = 'myself.workspace.v1';
export const roles = [
  {id:'work',name:'工作与创造',short:'工作',color:'#4060e8',icon:'briefcase'},
  {id:'family',name:'家人与关系',short:'关系',color:'#aa69c9',icon:'heart'},
  {id:'health',name:'健康与活力',short:'健康',color:'#25937d',icon:'leaf'},
  {id:'self',name:'自我与生活',short:'自我',color:'#cc8a35',icon:'sun'}
];
export function dateKey(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function shiftDate(key,delta){const d=new Date(key+'T12:00:00');d.setDate(d.getDate()+delta);return dateKey(d);}
export const uid=()=>globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function minutes(t){const [h,m]=t.split(':').map(Number);return h*60+m;}
export function clock(m){return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;}
export function isDate(v){return typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v+'T12:00:00')) && dateKey(new Date(v+'T12:00:00'))===v;}
export function validateTask(t){
  if(!t || typeof t.title!=='string'||!t.title.trim()||t.title.length>160)throw Error('请填写 1–160 字的任务名称');
  if(!roles.some(r=>r.id===t.role))throw Error('请选择生活角色');
  if(!isDate(t.date))throw Error('请选择有效日期');
  if(!Number.isInteger(t.duration)||t.duration<5||t.duration>240)throw Error('时长需为 5–240 分钟的整数');
  if(![1,2,3].includes(t.priority))throw Error('请选择优先级');
  if(t.time && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t.time)||minutes(t.time)+t.duration>1440))throw Error('固定时间和时长需要在同一天内');
  return {...t,title:t.title.trim(),notes:String(t.notes??'').slice(0,1000)};
}
export function validatePrefs(p){
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.end)||minutes(p.end)-minutes(p.start)<60)throw Error('可安排时段至少需要一小时，且结束时间晚于开始时间');
 if(!['morning','afternoon','evening'].includes(p.peak))throw Error('请选择专注时段');
 if(!Number.isInteger(p.focusMinutes)||p.focusMinutes<5||p.focusMinutes>120)throw Error('专注时长需为 5–120 分钟');
 return p;
}
export function defaultState(now=new Date()){
 const date=now.getHours()>=19?shiftDate(dateKey(now),1):dateKey(now);
 const titles=[['完成项目方案的第一稿','work',60,3,'','从已经整理的提纲开始，只写核心部分。'],['和家人通个电话','family',30,2,'19:30','留一段不被打断的时间。'],['去外面走一走','health',30,2,'17:30','路线和强度按自己的状态决定。'],['读完一篇想读的文章','self',25,1,'','把最有启发的一点记下来。'],['准备明天的穿搭','self',15,1,'20:30','看看明天的安排，提前准备。']];
 return {version:1,demo:true,selectedDate:date,tasks:titles.map(([title,role,duration,priority,time,notes])=>({id:uid(),title,role,duration,priority,date,time,notes,done:false,createdAt:now.toISOString()})),memories:[{id:uid(),title:'让专注有一个具体的起点',content:'开始前把任务缩小到一个可完成的动作，比如写好第一段，而不是“完成整个项目”。',type:'insight',role:'work',source:'示例笔记',createdAt:now.toISOString()},{id:uid(),title:'重要的人，也需要留出时间',content:'把和家人相处的时间放进日程，工作安排变化时也一起考虑。',type:'preference',role:'family',source:'示例偏好',createdAt:now.toISOString()}],prefs:{start:'09:00',end:'21:30',peak:'morning',focusMinutes:25,weights:{work:3,family:3,health:3,self:2}},focus:null};
}
export function emptyState(now=new Date()){const s=defaultState(now);return {...s,demo:false,tasks:[],memories:[],focus:null};}
export function sanitizeState(raw){
 if(!raw||raw.version!==1||!Array.isArray(raw.tasks)||!Array.isArray(raw.memories)||raw.tasks.length>2000||raw.memories.length>2000)throw Error('数据格式无法识别');
 const prefs=validatePrefs(raw.prefs);const weights=Object.fromEntries(roles.map(r=>[r.id,Math.max(1,Math.min(5,Number(prefs.weights?.[r.id])||3))]));
 const tasks=raw.tasks.map(t=>{const v=validateTask(t);if(typeof t.id!=='string'||!t.id)throw Error('任务标识无效');return {...v,done:Boolean(t.done)};});
 if(new Set(tasks.map(t=>t.id)).size!==tasks.length)throw Error('任务标识重复');
 const memories=raw.memories.map(m=>{if(typeof m.id!=='string'||typeof m.title!=='string'||typeof m.content!=='string'||!['fact','preference','insight'].includes(m.type)||!roles.some(r=>r.id===m.role))throw Error('记忆格式无效');return {...m,title:m.title.slice(0,160),content:m.content.slice(0,4000),source:String(m.source||'我的记录').slice(0,160)};});
 if(new Set(memories.map(m=>m.id)).size!==memories.length)throw Error('记忆标识重复');
 let focus=raw.focus;
 if(focus && (!tasks.some(t=>t.id===focus.taskId&&!t.done)||!Number.isFinite(focus.endAt)||!Number.isFinite(focus.remaining)||focus.remaining<0||!Number.isFinite(focus.initialSeconds)))focus=null;
 return {version:1,demo:!!raw.demo,selectedDate:isDate(raw.selectedDate)?raw.selectedDate:dateKey(),tasks,memories,prefs:{...prefs,weights},focus};
}
export function planDay(tasks,prefs,date,now=new Date()){
 const day=tasks.filter(t=>t.date===date);const scheduled=[];const overflow=[];const occupied=[];
 const start=minutes(prefs.start),end=minutes(prefs.end);
 const current=date===dateKey(now)?Math.ceil((now.getHours()*60+now.getMinutes())/5)*5:start;
 for(const t of day.filter(t=>t.time).sort((a,b)=>minutes(a.time)-minutes(b.time))){
  const at=minutes(t.time),finish=at+t.duration;
  const conflict=occupied.some(o=>at<o.end&&finish>o.start);
  scheduled.push({...t,start:at,end:finish,fixed:true,conflict,outside:at<start||finish>end});occupied.push({start:at,end:finish});
 }
 const flexible=day.filter(t=>!t.time).sort((a,b)=>Number(a.done)-Number(b.done)||b.priority-a.priority||(prefs.weights[b.role]||1)-(prefs.weights[a.role]||1)||String(a.createdAt).localeCompare(String(b.createdAt)));
 for(const t of flexible){
  let lower=Math.max(start,current);
  const preferred=t.role==='work'?(prefs.peak==='afternoon'?780:prefs.peak==='evening'?1080:start):t.role==='family'?1080:t.role==='health'?1020:start;
  const find=(from,to)=>{for(let at=Math.ceil(from/5)*5;at+t.duration<=to;at+=5)if(!occupied.some(o=>at<o.end&&at+t.duration>o.start))return at;return null;};
  if(t.done){scheduled.push({...t,start:start,end:start+t.duration,fixed:false,conflict:false,outside:false});continue;}
  let at=find(Math.max(lower,preferred),end);if(at===null)at=find(lower,end);
  if(at===null){overflow.push(t);continue;}
  scheduled.push({...t,start:at,end:at+t.duration,fixed:false,conflict:false,outside:false});occupied.push({start:at,end:at+t.duration});
 }
 for(const t of scheduled.filter(t=>t.fixed))t.conflict=scheduled.some(o=>o.id!==t.id&&o.fixed&&t.start<o.end&&t.end>o.start);
 return {scheduled:scheduled.sort((a,b)=>a.start-b.start),overflow};
}
export function nextTask(plan,date,now=new Date()){
 const current=now.getHours()*60+now.getMinutes();
 return plan.scheduled.find(t=>!t.done&&(date!==dateKey(now)||t.end>current))||plan.scheduled.find(t=>!t.done)||null;
}
export function applyTask(state,input){const task=validateTask(input);const old=state.tasks.find(t=>t.id===task.id);const clean={...old,...task,id:old?.id||uid(),done:old?.done||false,createdAt:old?.createdAt||new Date().toISOString()};return {...state,tasks:old?state.tasks.map(t=>t.id===old.id?clean:t):[...state.tasks,clean]};}
