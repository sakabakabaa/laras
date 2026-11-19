import {describe,expect,it} from 'vitest';
import {cardMatchingItemImages,cardMatchingTargets,isKaufhausTargets,kaufhausTargetFloor,moveMatchingCard} from '../src/lib/card-matching';
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
  it('resolves and renders individual card illustrations on deck cards when present',()=>{
    const a=activity();
    a.worksheet!.items[0].image='img000000000001';
    a.sources!.push({id:'img000000000001',title:'Pen',version:1,available:true,filename:'pen.jpg'});
    const itemImages=cardMatchingItemImages(a);
    expect(itemImages).toEqual({one:'/hcgi/platform/api/files/file_library/img000000000001/pen.jpg'});
    const markup=renderToStaticMarkup(createElement(ScheduledCardMatching,{sheet:a.worksheet!,targets:cardMatchingTargets(a),itemImages,responses:{},onChange:()=>{}}));
    expect(markup).toContain('class="sc-match-deck-media"');
    expect(markup).toContain('src="/hcgi/platform/api/files/file_library/img000000000001/pen.jpg"');
  });
  it('uses category help copy when targets have no images and marks deck empty once all cards are placed',()=>{
    const sheet={items:[{id:'one',type:'select' as const,prompt:'Satz 1',options:['A','B']}]};
    const textTargets=[{value:'A',title:'A · Text A',url:''},{value:'B',title:'B · Text B',url:''}];
    const markup=renderToStaticMarkup(createElement(ScheduledCardMatching,{sheet,targets:textTargets,responses:{one:'A'},onChange:()=>{}}));
    expect(markup).toContain('kotak tujuan yang sesuai');
    expect(markup).toContain('sc-match-deck is-empty');
  });
  it('detects Kaufhaus floor targets and renders the interactive 7-story cross-section with deck on top',()=>{
    const kaufhausTargets=[
      {value:'5. Stock',title:'5. Stock · Sport & Café',url:''},
      {value:'4. Stock',title:'4. Stock · Computer & Technik',url:''},
      {value:'2. Stock',title:'2. Stock · Herrenmode',url:''},
      {value:'EG',title:'EG · Kosmetik & Schreibwaren',url:''},
      {value:'UG',title:'UG · Lebensmittel',url:''},
    ];
    expect(isKaufhausTargets(kaufhausTargets)).toBe(true);
    expect(isKaufhausTargets([{value:'dest_1',title:'5. Stock · Sport'},{value:'dest_2',title:'EG · Kosmetik'}])).toBe(true);
    expect(kaufhausTargetFloor({value:'dest_1',title:'UG · Lebensmittel'})).toBe('ug');
    expect(isKaufhausTargets([{value:'A',title:'A · Text',url:''},{value:'B',title:'B · Text',url:''}])).toBe(false);
    const sheet={items:[
      {id:'k1',type:'select' as const,prompt:'1. der Kugelschreiber',translation:'1. pulpen',options:kaufhausTargets.map(t=>t.value)},
      {id:'k2',type:'select' as const,prompt:'2. der Schal',translation:'2. syal',options:kaufhausTargets.map(t=>t.value)},
    ]};
    const html=renderToStaticMarkup(createElement(ScheduledCardMatching,{
      sheet,
      targets:kaufhausTargets,
      itemImages:{k1:'/kugelschreiber.jpg'},
      responses:{k1:'EG'},
      onChange:()=>{},
    }));
    expect(html).toContain('sc-match-kaufhaus');
    expect(html).toContain('sc-kaufhaus-building');
    expect(html).toContain('sc-kaufhaus-awning');
    expect(html).toContain('sc-kaufhaus-street');
    expect(html).not.toContain('is-directory');
    expect(html).toContain('data-match-target="3. Stock"');
    expect(html).toContain('data-match-target="1. Stock"');
    expect(html).not.toContain('Info lantai');
    expect(html.indexOf('sc-match-bank')).toBeLessThan(html.indexOf('sc-kaufhaus-building'));
    expect(html).toContain('sc-kaufhaus-chip');
    expect(html).toContain('der Kugelschreiber');
    expect(html).not.toContain('>1. der Kugelschreiber<');
    expect(html).toContain('src="/kugelschreiber.jpg"');
    const act5={
      id:'10b',
      worksheet:{
        items:[{id:'k1',type:'select' as const,prompt:'1. das Parfüm',options:['UG','EG','2. Stock','4. Stock','5. Stock']}],
        blocks:[{id:'mb',type:'match' as const,layout:'destinations-above' as const,cardItemIds:['k1'],destinations:['UG','EG','2. Stock','4. Stock','5. Stock'].map(l=>({id:l,label:l,title:{de:l}}))}],
      },
    } as ScheduledActivity;
    const expanded=cardMatchingTargets(act5);
    expect(expanded.map(t=>t.value)).toEqual(['5. Stock','4. Stock','3. Stock','2. Stock','1. Stock','EG','UG']);
    expect(moveMatchingCard({},['k1'],expanded,'k1','3. Stock')).toEqual({k1:'3. Stock'});
  });
});
