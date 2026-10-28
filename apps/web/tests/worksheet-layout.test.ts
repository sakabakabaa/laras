import {describe,expect,it} from 'vitest';
import {singleGap,worksheetBlocks,writingRows} from '../src/lib/worksheet-layout';
const item=(id:string,prompt:string)=>({id,prompt,type:'text' as const});
describe('worksheet presentation without changing response identities',()=>{
  it('combines complete adjacent numbered gaps and preserves both answer IDs',()=>{
    const context='Ich (1) ______ bleiben und (2) ______ nicht arbeiten.';
    const blocks=worksheetBlocks([item('one',`A · Lücke 1: ${context}`),item('two',`A · Lücke 2: ${context}`)]);
    expect(blocks).toHaveLength(1);expect(blocks[0].gaps?.map(g=>g.item.id)).toEqual(['one','two']);expect(blocks[0].context).toBe(context);
  });
  it('keeps incomplete, duplicate and translated groups as separate original questions',()=>{
    const context='Ich (1) ______ bleiben und (2) ______ nicht arbeiten.',a=item('one',`A · Lücke 1: ${context}`),b=item('two',`A · Lücke 2: ${context}`);
    expect(worksheetBlocks([a])[0].gaps).toBeUndefined();
    expect(worksheetBlocks([a,{...a,id:'duplicate'}])).toHaveLength(2);
    expect(worksheetBlocks([a,{...b,translation:'Translated'}])).toHaveLength(2);
  });
  it('uses inline inputs only for unambiguous gaps and expands email composition',()=>{
    expect(singleGap(item('gap','Ich ______ bleiben.'))).toBe(true);
    expect(singleGap(item('essay','Explain ______ and ______.'))).toBe(false);
    expect(singleGap({...item('gap','Ich ______ bleiben.'),translation:'Translation'})).toBe(false);
    expect(writingRows(item('email','Ihre E-Mail: Schreiben Sie den vollständigen Text.'))).toBe(10);
    expect(writingRows(item('sentence','Schreiben Sie einen Satz.'))).toBe(3);
  });
});
