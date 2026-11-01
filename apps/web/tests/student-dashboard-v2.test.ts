import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router';
import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({data:{} as Record<string,unknown>,language:'id' as 'id'|'en'|'de'}));
vi.mock('@/hooks/use-cached-query',()=>({useCachedQuery:(key:string|null)=>({data:key?mock.data[key.split(':')[1]]??null:null,loading:false,error:'',reload:vi.fn()})}));
vi.mock('@/lib/pocketbase-client',()=>({default:{authStore:{record:{id:'student',name:'Alya'}},filter:()=>''}}));
vi.mock('@/lib/i18n',()=>({useLanguage:()=> mock.language}));
vi.mock('@/components/app/app-shell',()=>({AppShell:({children}:{children:unknown})=>children}));
vi.mock('@/components/app/course-thumb',()=>({CourseThumb:()=>null}));
import {StudentDashboard} from '../src/components/app/student-dashboard';
const render=()=>renderToStaticMarkup(createElement(MemoryRouter,null,createElement(StudentDashboard)));
beforeEach(()=>{mock.language='id';vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-02T07:00:00Z'));mock.data={courses:[{id:'c',title:'Deutsch',code:'GER'}],enrollments:[{course:'c'}],assignments:[{id:'task',course:'c',title:'Essay',status:'published',activityType:'formal',deadline:'2026-11-03T07:00:00Z'}],submissions:[],live:{items:[{id:'s',sessionId:'meeting',courseId:'c',courseTitle:'Deutsch',title:'Unterricht',startsAt:'2026-11-02T06:00:00Z',endsAt:'2026-11-02T08:00:00Z',joinUntil:'2026-11-02T07:30:00Z',checkedIn:false}]},runs:{items:[]}};});
afterEach(()=>vi.useRealTimers());
describe('student dashboard',()=>{
 it('prioritizes live class and courses and hides pending work',()=>{const html=render();expect(html.indexOf('Unterricht')).toBeLessThan(html.indexOf('Mata kuliah saya'));expect(html).not.toContain('Essay');expect(html).toContain('November 2026');expect(html).toContain('Bulan berikutnya');expect(html).toContain('Masuk kelas');expect(html).toContain('01:00:00');expect(html).toContain('/app/courses/c/pertemuan/meeting/terjadwal');expect(html).not.toContain('Petualanganmu');expect(html).not.toContain('Kegiatan diterbitkan');});
 it('shows honest empty states when there are no classes, work or courses',()=>{mock.data={courses:[],enrollments:[],assignments:[],submissions:[],live:{items:[]},runs:{items:[]}};const html=render();expect(html).toContain('Belum ada kelas terjadwal');expect(html).not.toContain('Perlu dikerjakan');expect(html).toContain('Belum ada mata kuliah');});
});

describe('class arrival timing',()=>{
 const setClass=(changes:Record<string,unknown>)=>{
  const live=mock.data.live as {items:Record<string,unknown>[]};
  Object.assign(live.items[0],changes);
 };
 it('shows lateness before check-in and elapsed time after check-in',()=>{
  expect(render()).toContain('Telat 60 menit');
  setClass({checkedIn:true});
  const html=render();expect(html).toContain('Berlangsung 60 menit');expect(html).not.toContain('Telat');expect(html).toContain('Lanjutkan kelas');
 });
 it('rounds upcoming minutes up and handles the start boundary',()=>{
  setClass({startsAt:'2026-11-02T07:10:01Z'});expect(render()).toContain('Dalam 11 menit');
  setClass({startsAt:'2026-11-02T07:00:01Z'});expect(render()).toContain('Dalam 1 menit');
  setClass({startsAt:'2026-11-02T07:00:00Z'});expect(render()).toContain('Baru dimulai');
  vi.setSystemTime(new Date('2026-11-02T07:01:00Z'));expect(render()).toContain('Telat 1 menit');
 });
 it('keeps closed check-in distinct from joining an active class',()=>{
  setClass({joinUntil:'2026-11-02T06:59:00Z'});
  const html=render();expect(html).toContain('Batas check-in sudah lewat');expect(html).toContain('Lihat kelas');expect(html).not.toContain('Masuk kelas');
 });
 it('localizes minute labels and the remaining-time clock',()=>{
  setClass({startsAt:'2026-11-02T06:59:00Z'});mock.language='en';expect(render()).toContain('1 minute late');expect(render()).toContain('Time remaining: 01:00:00');
  mock.language='de';expect(render()).toContain('1 Minute zu spät');
  setClass({startsAt:'2026-11-02T07:02:00Z'});expect(render()).toContain('In 2 Minuten');
 });
});
