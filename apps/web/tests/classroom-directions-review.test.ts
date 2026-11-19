import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
vi.mock('@/lib/pocketbase-client',()=>({default:{authStore:{record:{id:'student',language:'id'}}}}));
import {ActivityBrief} from '@/components/app/scheduled-classroom';
import {ScheduledCardMatching} from '@/components/app/scheduled-card-matching';
describe('classroom review corrections',()=>{
 it('pairs the floor question translation under one checklist marker',()=>{
  const html=renderToStaticMarkup(createElement(ActivityBrief,{content:'Wo finden Herr und Frau Wagner die Produkte?\n\nDi lantai mana Herr dan Frau Wagner menemukan produk?'}));
  expect(html.match(/<li(?:\s|>)/g)).toHaveLength(1);
  expect(html).toContain('lang="id">Di lantai mana');
  expect(html).toContain('sc-direction-subtitle');
 });
 it('shows all eight word options and preserves repeated finden',()=>{
  const html=renderToStaticMarkup(createElement(ActivityBrief,{content:'Wortkasten / Pilihan kata: brauchen | finden | finden | geben | gehen | haben | helfen | sein'}));
  expect(html).toContain('sc-word-option-list');
  expect(html.match(/lang="de">finden/g)).toHaveLength(2);
  expect(html.match(/<li /g)).toHaveLength(8);
  expect(html).not.toContain('sc-brief-steps');
 });
 it('uses the same sticky floor layout for situation cards without images',()=>{
  const html=renderToStaticMarkup(createElement(ScheduledCardMatching,{sheet:{items:[{id:'s',prompt:'Ihre Schwester kocht gern.',type:'select',options:['UG','EG']}]},targets:[{value:'UG',title:'Untergeschoss',url:''},{value:'EG',title:'Erdgeschoss',url:''}],responses:{},onChange:()=>{}}));
  expect(html).toContain('sc-kaufhaus-workspace sc-kaufhaus-sticky');
 });
});
