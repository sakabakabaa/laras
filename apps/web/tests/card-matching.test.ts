import {describe,expect,it} from 'vitest';
import {cardMatchingTargets,moveMatchingCard} from '../src/lib/card-matching';
import type {ScheduledActivity} from '../src/lib/scheduled-classes';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ScheduledCardMatching} from '../src/components/app/scheduled-card-matching';
const activity=()=>({id:'test',worksheet:{items:[{id:'one',type:'select',prompt:'Statement',options:['A','B']},{id:'two',type:'select',prompt:'Another',options:['A','B']}]},sources:[{id:'a',title:'Beim Arzt · Bild A',available:true,filename:'a.jpg'},{id:'b',title:'B · Patientin',available:true,url:'/b.jpg'}]} as ScheduledActivity);
describe('image matching with existing response IDs',()=>{
  it('recognises labelled destinations without treating ordinary choices as matching',()=>{
    expect(cardMatchingTargets(activity()).map(t=>t.value)).toEqual(['A','B']);
    expect(cardMatchingTargets({...activity(),sources:[]})).toEqual([]);
    expect(cardMatchingTargets({...activity(),sources:[...activity().sources!,activity().sources![0]]})).toEqual([]);
    const a=activity();a.worksheet!.items[1].options=['A','C'];expect(cardMatchingTargets(a)).toEqual([]);
  });
  it('allows several cards per target, reassignment and returning without mutating saved answers',()=>{
    const targets=cardMatchingTargets(activity()),initial={one:'A',unrelated:'keep'};
    const second=moveMatchingCard(initial,['one','two'],targets,'two','A');expect(second).toEqual({one:'A',two:'A',unrelated:'keep'});
    const moved=moveMatchingCard(second,['one','two'],targets,'one','B');expect(moved.one).toBe('B');expect(initial.one).toBe('A');
    expect(moveMatchingCard(moved,['one','two'],targets,'one','')).toEqual({two:'A',unrelated:'keep'});
    expect(moveMatchingCard(initial,['one','two'],targets,'injected','A')).toBe(initial);
    expect(moveMatchingCard(initial,['one','two'],targets,'one','wrong')).toBe(initial);
  });
  it('never turns unavailable private images into matching destinations',()=>{
    const a=activity();a.sources![0].available=false;expect(cardMatchingTargets(a)).toEqual([]);
  });
  it('renders saved answers under their destinations once, with unanswered cards in the stack',()=>{
    const a=activity(),markup=renderToStaticMarkup(createElement(ScheduledCardMatching,{sheet:a.worksheet!,targets:cardMatchingTargets(a),responses:{one:'A'},onChange:()=>{}}));
    const bank=markup.split('class="sc-match-bank ')[1].split('</section>')[0],targetA=markup.split('data-match-target="A"')[1].split('data-match-target="B"')[0];
    expect(bank).toContain('data-card-id="two"');expect(bank).not.toContain('data-card-id="one"');expect(targetA).toContain('data-card-id="one"');expect(markup.match(/data-card-id="one"/g)).toHaveLength(1);
  });
});
