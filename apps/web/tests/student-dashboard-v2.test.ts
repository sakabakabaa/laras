import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router';
import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({data:{} as Record<string,unknown>}));
vi.mock('@/hooks/use-cached-query',()=>({useCachedQuery:(key:string|null)=>({data:key?mock.data[key.split(':')[1]]??null:null,loading:false,error:'',reload:vi.fn()})}));
vi.mock('@/lib/pocketbase-client',()=>({default:{authStore:{record:{id:'student',name:'Alya'}},filter:()=>''}}));
vi.mock('@/lib/i18n',()=>({useLanguage:()=> 'id'}));
vi.mock('@/components/app/app-shell',()=>({AppShell:({children}:{children:unknown})=>children}));
vi.mock('@/components/app/course-thumb',()=>({CourseThumb:()=>null}));
import {StudentDashboard} from '../src/components/app/student-dashboard';
const render=()=>renderToStaticMarkup(createElement(MemoryRouter,null,createElement(StudentDashboard)));
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-02T07:00:00Z'));mock.data={courses:[{id:'c',title:'Deutsch',code:'GER'}],enrollments:[{course:'c'}],assignments:[{id:'task',course:'c',title:'Essay',status:'published',activityType:'formal',deadline:'2026-11-03T07:00:00Z'}],submissions:[],live:{items:[{id:'s',sessionId:'meeting',courseId:'c',courseTitle:'Deutsch',title:'Unterricht',startsAt:'2026-11-02T06:00:00Z',endsAt:'2026-11-02T08:00:00Z',joinUntil:'2026-11-02T07:30:00Z',checkedIn:false}]},runs:{items:[]}};});
afterEach(()=>vi.useRealTimers());
describe('student dashboard',()=>{
 it('prioritizes the live class, then work and courses without a game',()=>{const html=render();expect(html.indexOf('Unterricht')).toBeLessThan(html.indexOf('Essay'));expect(html.indexOf('Essay')).toBeLessThan(html.indexOf('Mata kuliah saya'));expect(html).toContain('Masuk kelas');expect(html).toContain('01:00:00');expect(html).toContain('/app/courses/c/pertemuan/meeting/terjadwal');expect(html).not.toContain('Petualanganmu');expect(html).not.toContain('Kegiatan diterbitkan');});
 it('shows honest empty states when there are no classes, work or courses',()=>{mock.data={courses:[],enrollments:[],assignments:[],submissions:[],live:{items:[]},runs:{items:[]}};const html=render();expect(html).toContain('Belum ada kelas terjadwal');expect(html).toContain('Semua tugas sudah selesai');expect(html).toContain('Belum ada mata kuliah');});
});
