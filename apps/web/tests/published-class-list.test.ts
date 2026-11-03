import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router';
import {beforeEach,expect,it,vi} from 'vitest';

const data=vi.hoisted(()=>({legacyError:'',builderError:'',builderLoading:false}));
vi.mock('@/hooks/use-cached-query',()=>({useCachedQuery:(key:string)=>({data:key==='scheduled-class-list'?{items:data.legacyError?[]:[{id:'old',session:'meeting',title:'Existing class',phase:'closed',startsAt:'2030-01-01T09:00:00Z',endsAt:'2030-01-01T10:00:00Z',course:{id:'course',title:'German',code:'DE1'},activityCount:2,checkedIn:1}]}:key==='builder-publications:kelas'?{items:data.builderError?[]:[{id:'new',kind:'kelas',title:'Published class',courseId:'course',courseTitle:'German',courseCode:'DE1',startsAt:'2030-01-01T09:00:00Z',dueAt:'2030-01-01T10:00:00Z',closed:false,activityCount:3,checkedIn:2}]}:[],loading:key==='builder-publications:kelas'&&data.builderLoading,error:key==='scheduled-class-list'?data.legacyError:key==='builder-publications:kelas'?data.builderError:'',reload:vi.fn()})}));
vi.mock('@/components/app/builder/builder-entry',()=>({BuilderDraftList:()=>createElement('aside',null,'Drafts')}));
import {ScheduledSessionsIndex} from '../src/components/app/scheduled-sessions-index';
import {BuilderAssignmentCard} from '../src/components/app/builder/builder-assignment-card';

const render=()=>renderToStaticMarkup(createElement(MemoryRouter,null,createElement(ScheduledSessionsIndex)));
beforeEach(()=>{data.legacyError='';data.builderError='';data.builderLoading=false;});

it('renders both class sources inside the normal list, with no extra published panel',()=>{
  const html=render();
  expect(html).toContain('Existing class');
  expect(html).toContain('Published class');
  expect(html.match(/class="ss-session-row"/g)).toHaveLength(2);
  expect(html).toContain('href="/app/kelas-terjadwal/course/meeting"');
  expect(html).toContain('href="/app/kegiatan/new"');
  expect(html).not.toContain('Kegiatan diterbitkan');
  expect(html).not.toContain('Mulai kelas terjadwal pertama');
});
it('keeps available publications visible when the original class request fails',()=>{
  data.legacyError='Original classes failed';
  const html=render();
  expect(html).toContain('role="alert"');
  expect(html).toContain('Published class');
  expect(html).not.toContain('Mulai kelas terjadwal pertama');
});
it('keeps original classes visible when the publication request fails',()=>{
  data.builderError='Published classes failed';
  const html=render();
  expect(html).toContain('role="alert"');
  expect(html).toContain('Existing class');
});
it('waits for both sources instead of briefly displaying an empty class list',()=>{
  data.builderLoading=true;
  const html=render();
  expect(html).toContain('Memuat kelas');
  expect(html).not.toContain('Mulai kelas terjadwal pertama');
});
it('renders published assignments with the normal Tugas card style and real progress',()=>{
  const html=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(BuilderAssignmentCard,{run:{id:'new',kind:'tugas',title:'Email writing',closed:false,revision:1,startsAt:'',dueAt:'2030-01-01T10:00:00Z',courseTitle:'German',submittedCount:5,gradedCount:2,activityCount:3}})));
  expect(html).toContain('class="eval-board-card"');
  expect(html).toContain('Tugas formal');
  expect(html).toContain('5 terkumpul');
  expect(html).toContain('2 nilai diterbitkan');
  expect(html).toContain('3 menunggu nilai');
  expect(html).toContain('href="/app/kegiatan/new"');
});
