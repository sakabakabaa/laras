export type CardPointer = {pointerId:number;clientX:number;clientY:number};
export type CardDragSource = {setPointerCapture:(id:number)=>void;hasPointerCapture:(id:number)=>boolean;releasePointerCapture:(id:number)=>void};
export function createCardPointerDrag(callbacks:{move:(id:string,dx:number,dy:number,event:CardPointer)=>void;drop:(id:string,event:CardPointer)=>void;clear:()=>void}){
 let active:{id:string;pointer:CardPointer;source:CardDragSource;moved:boolean}|null=null;
 const finish=(event?:CardPointer,cancelled=false)=>{
  if(!active||(event&&active.pointer.pointerId!==event.pointerId))return false;
  const last=active;active=null;
  // Clear the visual and capture even if the drop callback fails or reparents a card.
  try{if(last.source.hasPointerCapture(last.pointer.pointerId))last.source.releasePointerCapture(last.pointer.pointerId);}catch{/* The source may already be detached. */}
  callbacks.clear();
  if(last.moved&&!cancelled&&event)callbacks.drop(last.id,event);
  return last.moved;
 };
 return {
  start(id:string,event:CardPointer,source:CardDragSource){finish(undefined,true);active={id,pointer:{pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY},source,moved:false};try{source.setPointerCapture(event.pointerId);}catch{/* Window release listeners still finish the drag. */}},
  move(event:CardPointer){if(!active||active.pointer.pointerId!==event.pointerId)return;const dx=event.clientX-active.pointer.clientX,dy=event.clientY-active.pointer.clientY;if(!active.moved&&Math.hypot(dx,dy)<8)return;active.moved=true;callbacks.move(active.id,dx,dy,event);},
  finish,
  cancel(){return finish(undefined,true);},
 };
}
