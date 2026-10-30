import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import type {ScheduledSource} from '@/lib/scheduled-class-ai';
vi.mock('@/lib/pocketbase-client',()=>({default:{authStore:{record:{language:'en'}}}}));
import {ScheduledMaterialPicker} from '@/components/app/scheduled-material-picker';
const material: ScheduledSource = {id:'chapter',title:'Chapter 9',version:1,access:'student',aiReady:false,sessionIds:['meeting'],url:'/hcgi/platform/api/files/file_library/chapter/chapter.pdf'};
const render=(ai:boolean,materials=[material])=>renderToStaticMarkup(createElement(ScheduledMaterialPicker,{materials,sessionId:'meeting',value:[],onChange:()=>{},ai}));
describe('scheduled material availability',()=>{
 it('shows unprepared files as usable references with a working file target',()=>{
  const html=render(false);expect(html).toContain('Chapter 9');expect(html).toContain(material.url);expect(html).not.toContain('disabled=""');
 });
 it('keeps unprepared files visible for AI while requiring preparation before selection',()=>{
  const html=render(true);expect(html).toContain('Chapter 9');expect(html).toContain('Not ready for AI');expect(html).toContain('disabled=""');expect(html).toContain('/app/berkas/chapter');expect(html).toContain('review and approve');
 });
 it('enables AI selection for an approved source',()=>{
  const html=render(true,[{...material,aiReady:true}]);expect(html).not.toContain('disabled=""');expect(html).toContain('Ready for AI');
 });
});
