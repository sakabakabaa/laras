import type {ScheduledWorksheet} from './scheduled-classes';

type Item=ScheduledWorksheet['items'][number];
export type WorksheetBlock={items:Item[];context?:string;section?:string;gaps?:{number:string;item:Item}[]};

// Existing numbered gap worksheets keep their original response IDs. Only combine
// adjacent prompts when every numbered blank has exactly one matching item.
export function worksheetBlocks(items:Item[]):WorksheetBlock[]{
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
