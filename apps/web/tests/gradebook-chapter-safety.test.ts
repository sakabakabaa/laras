import { describe, it, expect } from 'vitest';
import { componentScore, type GradeComponent, type GradeEntry } from '../src/lib/gradebook';
const component = {id:'c',kind:'manual',maxScore:100,chapters:[{id:'a',label:'A'}]} as GradeComponent;
function score(c:GradeComponent,entry?:Partial<GradeEntry>) {
 const entries=new Map<string,Map<string,GradeEntry>>();
 if(entry) entries.set('c',new Map([['student',entry as GradeEntry]]));
 return componentScore(c,'student',entries,new Map()).score;
}
describe('current chapter definitions drive grades',()=>{
 it('recalculates when a chapter is added',()=>expect(score({...component,chapters:[...component.chapters!,{id:'b',label:'B'}]},{value:100,chapters:{a:'done'}})).toBe(50));
 it('recalculates when a chapter is removed',()=>expect(score(component,{value:50,chapters:{a:'done',b:'missing'}})).toBe(100));
 it('uses partial credit and the current maximum',()=>expect(score({...component,maxScore:20},{value:100,chapters:{a:'partial'}})).toBe(50));
 it('preserves ungraded entries',()=>expect(score(component)).toBeNull());
 it('keeps ordinary manual grades',()=>expect(score({...component,chapters:[]},{value:70})).toBe(70));
});
