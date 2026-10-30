import {describe,it,expect,vi} from 'vitest';
vi.mock('@/lib/pocketbase-client',()=>({default:{}}));
import{translate,type Language}from'@/lib/i18n';
import{practiceSystemMessage}from'@/lib/practice-i18n';
describe('practice interface translations',()=>{
 it.each(['id','en','de'] as Language[])('formats dynamic labels in %s without unresolved placeholders',language=>{
  for(const[key,vars]of [
   ['practiceUi.courseCountOne',{count:'1'}],['practiceUi.courseCountMany',{count:'2'}],
   ['practiceUi.miniLessons',{opened:'3',correct:'2',total:'4'}],['practiceUi.replyCount',{count:'2'}],
  ] as const){const value=translate(language,key,vars);expect(value).not.toBe(key);expect(value).not.toMatch(/\{\w+\}/);}
 });
 it('uses correct singular and plural course counts',()=>{
  expect(translate('de','practiceUi.courseCountOne',{count:'1'})).toBe('1 Kurs');
  expect(translate('de','practiceUi.courseCountMany',{count:'2'})).toBe('2 Kurse');
  expect(translate('en','practiceUi.courseCountOne',{count:'1'})).toBe('1 course');
 });
 it('localizes server readiness and failure messages',()=>{
  const t=(key:string)=>translate('de',key);
  expect(practiceSystemMessage(t,'Belum ada pertemuan yang memenuhi syarat.')).toBe('Noch keine passenden Kurstermine vorhanden.');
  expect(practiceSystemMessage(t,'Tunggu sebentar sebelum mencoba lagi.')).toBe('Bitte warte einen Moment, bevor du es erneut versuchst.');
 });
 it('preserves academic content while using localized fallbacks for unknown service errors',()=>{
  const t=(key:string)=>translate('en',key);
  for(const content of ['Guten Tag!','Jawaban mahasiswa tentang hobi','constructor'])expect(practiceSystemMessage(t,content)).toBe(content);
  expect(practiceSystemMessage(t,'Unrecognized upstream failure','practiceUi.requestFailed')).toBe('The request failed. Please try again.');
 });
});
