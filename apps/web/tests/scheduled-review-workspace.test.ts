import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect, it} from 'vitest';
import {ScheduledReviewWorkspace} from '../src/components/app/scheduled-review-workspace';

const state:any={owner:true,session:{id:'session'},class:{id:'class',phase:'closed',revision:4},activities:[{id:'a',kind:'assignment',title:'Worksheet',minutes:10,required:true,startsAt:'',endsAt:'',worksheet:{items:[{id:'i',prompt:'Prompt',type:'text'}]}}],attempts:[{id:'attempt',activity:'a',student:'s',answers:{responses:{i:'My response'}},revision:2,status:'submitted',complete:true}],report:[{student:'s',name:'Student',nim:'1',attempts:[]}],gradingSettings:[{id:"settings",activity:"a",revision:1,mode:"points",maxPoints:10,criteria:[]}],assessments:[],events:[],serverNow:''};
it('renders student response and provides manual review actions',()=>{const html=renderToStaticMarkup(createElement(ScheduledReviewWorkspace,{state,onAction:async()=>{}}));expect(html).toContain('My response');expect(html).toContain('Simpan draf');expect(html).toContain('Ditinjau');});
it('renders a searchable student sidebar with status and submission counts',()=>{const html=renderToStaticMarkup(createElement(ScheduledReviewWorkspace,{state,onAction:async()=>{}}));expect(html).toContain('aria-label="Daftar mahasiswa"');expect(html).toContain('Cari nama atau NIM...');expect(html).toContain('aria-label="Filter penilaian"');expect(html).toContain('0/1 ditinjau');expect(html).toContain('aria-current="true"');});
