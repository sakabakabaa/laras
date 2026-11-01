import {describe,it,expect} from 'vitest';
import {dashboardClasses,dashboardWeek,jakartaDay,orderByDeadline,type StudentLiveClass} from '../src/lib/student-dashboard-data';
import type {BuilderRunItem} from '../src/lib/builder-delivery';
const now=Date.parse('2026-11-02T07:00:00Z');
const scheduled:StudentLiveClass={id:'s',sessionId:'meeting',courseId:'course',courseTitle:'German',title:'Live class',startsAt:'2026-11-02T06:30:00Z',endsAt:'2026-11-02T07:30:00Z',joinUntil:'2026-11-02T07:15:00Z',phase:'open',checkedIn:true};
const builder={id:'b',kind:'kelas',title:'Builder class',courseTitle:'Grammar',startsAt:'2026-11-02T08:00:00Z',dueAt:'2026-11-02T09:00:00Z',startedAt:'',submittedAt:'',closed:false} as BuilderRunItem;
describe('student dashboard priorities',()=>{
 it('shows all active classes first and retains direct routes, including builder classes',()=>{
  const classes=dashboardClasses([{...scheduled,phase:'scheduled'}],[builder],now);
  expect(classes.map(c=>c.phase)).toEqual(['live','upcoming']);expect(classes[0].checkedIn).toBe(true);expect(classes[0].href).toBe('/app/courses/course/pertemuan/meeting/terjadwal');expect(classes[1].href).toBe('/app/kegiatan/b');
 });
 it('omits ended, closed and invalid classes without treating other work as a class',()=>{
  expect(dashboardClasses([{...scheduled,endsAt:'2026-11-02T06:59:00Z'},{...scheduled,id:'bad',startsAt:''}],[{...builder,closed:true},{...builder,id:'task',kind:'tugas'}],now)).toEqual([]);
 });
 it('orders deadlines first and leaves undated work at the end',()=>{
  expect(orderByDeadline([{id:'none',deadline:''},{id:'later',deadline:'2026-11-04T00:00:00Z'},{id:'soon',deadline:'2026-11-02T09:00:00Z'}]).map(item=>item.id)).toEqual(['soon','later','none']);
 });
});

it('groups classes and deadlines by Jakarta day across midnight',()=>{
 const start=Date.parse('2026-11-01T17:30:00Z');expect(jakartaDay(start)).toBe('2026-11-02');
 const klass=dashboardClasses([{...scheduled,startsAt:'2026-11-02T03:00:00Z',endsAt:'2026-11-02T04:00:00Z'}],[],start);
 const week=dashboardWeek(start,klass,[{id:'work',title:'Essay',course:'German',deadline:'2026-11-02T16:00:00Z',href:'/task'}]);
 expect(week.days[0]).toBe('2026-11-02');expect(week.days[1]).toBe('2026-11-03');expect(week.events.map(e=>jakartaDay(e.date))).toEqual(['2026-11-02','2026-11-02']);expect(week.events.map(e=>e.href)).toEqual(['/app/courses/course/pertemuan/meeting/terjadwal','/task']);
});
