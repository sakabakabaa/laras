import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import type {ScheduledWorksheet} from '@/lib/scheduled-classes';
vi.mock('@/lib/pocketbase-client',()=>({default:{authStore:{record:{id:'student',language:'en'}}}}));
import {WorksheetAnswers} from '@/components/app/scheduled-worksheet';
const sheet:ScheduledWorksheet={items:[{id:'choice',prompt:'Choose a role.',type:'select',options:['A','P']},{id:'writing',prompt:'Write your reply.',type:'text'}]};
const render=(responses:Record<string,string>)=>renderToStaticMarkup(createElement(WorksheetAnswers,{sheet,responses,onChange:()=>{}}));
describe('scheduled worksheet response feedback',()=>{
 it('counts only valid choices and nonblank writing without exposing completion as grading',()=>{
  expect(render({choice:'invalid',writing:'   '})).toContain('0 of 2 answers filled in');
  const html=render({choice:'P',writing:'Meine Antwort.'});
  expect(html).toContain('2 of 2 answers filled in');
  expect(html).toContain('Meine Antwort.');
  expect(html).not.toContain('correct answer');
 });
 it('preserves the input values and the 2000 character limit',()=>{
  const html=render({writing:'Antwort'});
  expect(html).toContain('maxLength="2000"');
  expect(html).toContain('7 / 2,000 characters');
  expect(html).toContain('>Antwort</textarea>');
 });
});
