import type {Entry} from './domain';
const minute=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3));
/** Keep model suggestions from creating new overlapping fixed appointments. */
export function protectSchedule(proposed:Record<string,any>[],existing:Entry[],profile:Record<string,any>|undefined){
 const start=minute(profile?.start||'09:00'),end=minute(profile?.end||'21:30');
 const occupied=existing.filter(r=>r.kind==='task'&&r.data.time).map(r=>({date:r.data.date,start:minute(r.data.time),end:minute(r.data.time)+r.data.duration}));
 return proposed.map(value=>{const task:Record<string,any>={...value,done:false};if(!task.time)return task;const at=minute(task.time),finish=at+task.duration;
  if(at<start||finish>end||occupied.some(o=>o.date===task.date&&at<o.end&&finish>o.start)){task.time='';task.notes=[task.notes,'建议时间与已有安排或可用时段冲突，已改为灵活安排。'].filter(Boolean).join(' ').slice(0,1000);}
  else occupied.push({date:task.date,start:at,end:finish});return task;
 });
}
