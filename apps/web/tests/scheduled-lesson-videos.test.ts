import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runInNewContext} from 'node:vm';
import {describe,expect,it} from 'vitest';
const pair={de:'Deutsch',id:'Indonesia'};
const video={id:'beschwerden',title:pair,src:'/media/lessons/beim-arzt/beschwerden.mp4',poster:'/media/lessons/beim-arzt/beschwerden.jpg',duration:'1:02'};
const sandbox={exports:{} as {validate:(value:unknown,materials:string[])=>any}};
runInNewContext(readFileSync(resolve('../pocketbase/pb_hooks/scheduled-lesson-domain.js'),'utf8'),sandbox);
const validate=sandbox.exports.validate;
describe('lesson videos',()=>{
 it('preserves bounded local chapters and rejects remote or malformed assets',()=>{
  const lesson={goal:pair,steps:[pair],scenes:[],videos:[video]};
  expect(validate(lesson,[]).videos).toEqual([video]);
  for(const src of ['https://example.org/video.mp4','//example.org/video.mp4','/media/lessons/../secret.mp4','/media/lessons/x.jpg','javascript:alert(1)'])expect(()=>validate({...lesson,videos:[{...video,src}]},[])).toThrow();
  expect(()=>validate({...lesson,videos:[video,video]},[])).toThrow();
 });
 it('changes only the targeted lesson presentation and restores it on rollback',()=>{
  let up!:(app:any)=>void,down!:(app:any)=>void;
  runInNewContext(readFileSync(resolve('../pocketbase/pb_migrations/1793000004_beim_arzt_lesson_videos.js'),'utf8'),{migrate:(a:typeof up,b:typeof down)=>{up=a;down=b;}});
  const original={lesson:{goal:pair,steps:[pair],scenes:Array.from({length:5},(_,i)=>({kind:'context',title:{...pair,de:String(i)}}))},questions:[],worksheet:{items:[{id:'existing'}]}};
  let snapshot=structuredClone(original),saved=0;
  const record={getString:()=>JSON.stringify(snapshot),set:(_key:string,value:any)=>{snapshot=value;}};
  const app={findRecordsByFilter:(_name:string,filter:string,_sort:string,_limit:number,_offset:number,params:any)=>{expect(filter).toContain('title');expect(params.class).toBe('oxeb6ykx9qlwqiy');return[record];},save:()=>saved++};
  up(app);expect((snapshot.lesson as any).videos).toHaveLength(2);expect(snapshot.lesson.scenes).toEqual(original.lesson.scenes);expect(snapshot.worksheet).toEqual(original.worksheet);
  down(app);expect(snapshot).toEqual(original);expect(saved).toBe(2);
 });
});
