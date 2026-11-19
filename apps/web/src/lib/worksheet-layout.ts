import type {ScheduledWorksheet,WorksheetBlock as ExplicitBlock} from './scheduled-classes';

type Item=ScheduledWorksheet['items'][number];
export type WorksheetBlock={items:Item[];context?:string;section?:string;prompt?:string;gaps?:{number:string;item:Item}[];rows?:number};

// Existing numbered gap worksheets keep their original response IDs. Only combine
// adjacent prompts when every numbered blank has exactly one matching item, or when
// explicit worksheet.blocks (`passage` / `gap` / `writing`) are present.
export function worksheetBlocks(items:Item[],explicitBlocks?:ExplicitBlock[]):WorksheetBlock[]{
  if(explicitBlocks?.length){
    const byId=new Map(items.map(item=>[item.id,item]));
    const out:WorksheetBlock[]=[];
    const seen=new Set<string>();
    for(const b of explicitBlocks){
      if(b.type==='passage'){
        for(const [sIdx,sec] of b.sections.entries()){
          const group:Item[]=[],gaps:{number:string;item:Item}[]=[];
          let gapCounter=0;
          const inferredSection=sec.segments.map(seg=>seg.type==='gap'?byId.get(seg.itemId)?.prompt.match(/^(.+?)\s*·\s*Lücke\s+\d+\s*:/)?.[1]:'').find(Boolean);
          const section=sec.heading?.de||sec.heading?.id||inferredSection||(b.sections.length>1?`Bagian ${sIdx+1}`:undefined);
          let firstText=true;
          const context=sec.segments.map(seg=>{
            if(seg.type==='text'){
              let txt=seg.text.de||seg.text.id||'';
              if(firstText){
                firstText=false;
                if(section&&/^Dialog\s+[A-Z]\b/i.test(section))txt=txt.replace(/^[A-Z]\s*·\s*/,'');
              }
              return txt;
            }
            firstText=false;
            const item=byId.get(seg.itemId);
            if(!item)return '';
            gapCounter++;
            const explicitNum=item.prompt.match(/·\s*Lücke\s+(\d+)\s*:/)?.[1];
            const num=explicitNum||String(gapCounter);
            group.push(item);gaps.push({number:num,item});seen.add(item.id);
            return `(${num}) ______`;
          }).join('');
          if(group.length){
            out.push({items:group,section,prompt:b.prompt?.de||b.prompt?.id,context,gaps});
          }
        }
      }else if(b.type==='gap'){
        const group:Item[]=[],gaps:{number:string;item:Item}[]=[];
        let gapCounter=0;
        const context=b.segments.map(seg=>{
          if(seg.type==='text')return seg.text.de||seg.text.id||'';
          const item=byId.get(seg.itemId);
          if(!item)return '';
          gapCounter++;
          const explicitNum=item.prompt.match(/·\s*Lücke\s+(\d+)\s*:/)?.[1];
          const num=explicitNum||String(gapCounter);
          group.push(item);gaps.push({number:num,item});seen.add(item.id);
          return `(${num}) ______`;
        }).join('');
        if(group.length)out.push({items:group,context,gaps});
      }else if(b.type==='writing'){
        const item=byId.get(b.itemId);
        if(item){seen.add(item.id);out.push({items:[item],rows:b.rows||(b.responseLength==='extended'?10:3)});}
      }else if(b.type==='reflection'){
        for(const id of b.itemIds){const item=byId.get(id);if(item){seen.add(item.id);out.push({items:[item]});}}
      }else if(b.type==='match'){
        for(const id of b.cardItemIds){const item=byId.get(id);if(item){seen.add(item.id);out.push({items:[item]});}}
      }
    }
    for(const item of items)if(!seen.has(item.id))out.push({items:[item]});
    if(out.length)return out;
  }
  const blocks:WorksheetBlock[]=[];
  for(let i=0;i<items.length;){
    const match=items[i].type==='text'&&!items[i].translation&&items[i].prompt.match(/^(.+?) · Lücke (\d+): ([\s\S]+)$/);
    if(match){
      const [,section,,context]=match,group:Item[]=[],gaps:{number:string;item:Item}[]=[];
      let end=i;
      while(end<items.length){
        const m=items[end].prompt.match(/^(.+?) · Lücke (\d+): ([\s\S]+)$/);
        if(items[end].type!=='text'||items[end].translation||!m||m[1]!==section||m[3]!==context)break;
        group.push(items[end]);gaps.push({number:m[2],item:items[end]});end++;
      }
      const numbers=[...context.matchAll(/\((\d+)\)\s*_{3,}/g)].map(m=>m[1]);
      if(numbers.length===gaps.length&&new Set(numbers).size===numbers.length&&numbers.every(n=>gaps.filter(g=>g.number===n).length===1)){
        blocks.push({items:group,section,context,gaps});i=end;continue;
      }
    }
    blocks.push({items:[items[i++]]});
  }
  return blocks;
}

export function singleGap(item:Item){
  return item.type==='text'&&!item.translation&&(item.prompt.match(/_{3,}/g)||[]).length===1;
}

export function writingRows(item:Item){return /\be-?mail\b/i.test(item.prompt)?10:3;}

