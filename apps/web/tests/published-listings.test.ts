import {describe,expect,it} from 'vitest';
import type {Assignment} from '../src/lib/assignments';
import type {BuilderRunItem} from '../src/lib/builder-delivery';
import type {ScheduledSessionListItem} from '../src/lib/scheduled-session-workspace';
import {filterTaskPublications,mergeClassPublications,mergeTaskPublications,publicationClosed,taskPublicationTotals} from '../src/lib/published-listings';

const now=Date.parse('2030-01-01T10:00:00Z');
const run:BuilderRunItem={id:'shared-id',title:'Email writing',kind:'tugas',closed:false,revision:2,startsAt:'2030-01-01T09:00:00Z',dueAt:'2030-01-01T11:00:00Z',courseId:'course',courseTitle:'German A1',courseCode:'DE1',created:'2030-01-01T08:00:00Z',activityCount:3,checkedIn:5,submittedCount:4,gradedCount:2};
const session:ScheduledSessionListItem={id:'shared-id',session:'meeting',title:'Existing class',status:'scheduled',phase:'open',startsAt:'2030-01-01T09:30:00Z',endsAt:'2030-01-01T10:30:00Z',course:{id:'course',title:'German A1',code:'DE1'},section:'A',activityCount:2,checkedIn:8};
const assignment={id:'shared-id',title:'Existing task',course:'course',activityType:'formal',created:'2029-12-31T09:00:00Z'} as Assignment;
const courses=[{id:'course',title:'German A1',code:'DE1'}];

describe('unified scheduled class listings',()=>{
  it('merges publications into the same class list while preserving both workspaces',()=>{
    const items=mergeClassPublications([session],[{...run,kind:'kelas',meetingId:'new-meeting',section:'B'}],now);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({key:'session:shared-id',href:'/app/kelas-terjadwal/course/meeting'});
    expect(items[1]).toMatchObject({key:'builder:shared-id',href:'/app/kegiatan/shared-id',phase:'open',activityCount:3,checkedIn:5,section:'B',course:{id:'course',code:'DE1'}});
  });
  it('puts builder classes in the existing upcoming, ongoing, and completed categories',()=>{
    const runs=[{...run,id:'future',kind:'kelas',startsAt:'2030-01-01T12:00:00Z',dueAt:'2030-01-01T13:00:00Z'},{...run,id:'past',kind:'kelas',dueAt:'2030-01-01T10:00:00Z'},{...run,id:'closed',kind:'kelas',closed:true},{...run,id:'current',kind:'kelas'}];
    expect(Object.fromEntries(mergeClassPublications([],runs,now).map(item=>[item.id,item.phase]))).toEqual({future:'scheduled',past:'closed',closed:'closed',current:'open'});
  });
  it('never puts assignments in the class list or modifies source records',()=>{
    const before=structuredClone(session);
    expect(mergeClassPublications([session],[run],now)).toHaveLength(1);
    expect(session).toEqual(before);
  });
});

describe('unified task listings',()=>{
  it('mixes regular tasks and builder publications in one chronological list',()=>{
    const items=mergeTaskPublications([assignment],[run,{...run,id:'class',kind:'kelas'}],courses);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({source:'builder',key:'builder:shared-id',activityType:'formal',courseId:'course',href:'/app/kegiatan/shared-id'});
    expect(items[1]).toMatchObject({source:'assignment',key:'assignment:shared-id',href:'/app/tugas/shared-id'});
  });
  it('applies course, title, course-code and formal/formative filters to both sources',()=>{
    const items=mergeTaskPublications([assignment,{...assignment,id:'practice',activityType:'formative',title:'Practice'}],[run],courses);
    expect(filterTaskPublications(items,{courseId:'course',type:'all',search:'  de1  '})).toHaveLength(3);
    expect(filterTaskPublications(items,{courseId:'course',type:'formal',search:''})).toHaveLength(2);
    expect(filterTaskPublications(items,{courseId:'all',type:'formative',search:''}).map(item=>item.title)).toEqual(['Practice']);
    expect(filterTaskPublications(items,{courseId:'all',type:'all',search:'EMAIL'}).map(item=>item.source)).toEqual(['builder']);
    expect(filterTaskPublications(items,{courseId:'other',type:'all',search:''})).toEqual([]);
  });
  it('does not treat a late-accepting publication as closed at its due date',()=>{
    expect(publicationClosed({...run,dueAt:'2030-01-01T09:00:00Z',closesAt:'2030-01-01T11:00:00Z'},now)).toBe(false);
    expect(publicationClosed({...run,closesAt:'2030-01-01T10:00:00Z'},now)).toBe(true);
    expect(publicationClosed({...run,closed:true},now)).toBe(true);
  });
  it('includes both sources in totals without counting drafts or formative work as collected grades',()=>{
    const items=mergeTaskPublications([assignment,{...assignment,id:'practice',activityType:'formative'}],[run],courses);
    const submissions=[{assignment:assignment.id,status:'graded'},{assignment:assignment.id,status:'submitted'},{assignment:assignment.id,status:'draft'},{assignment:'practice',status:'submitted'}];
    expect(taskPublicationTotals(items,submissions)).toEqual({total:3,formal:2,formative:1,collected:6,waiting:3});
    const filtered=filterTaskPublications(items,{courseId:'all',type:'all',search:'Email'});
    expect(taskPublicationTotals(filtered,submissions)).toEqual({total:1,formal:1,formative:0,collected:4,waiting:2});
  });
});
