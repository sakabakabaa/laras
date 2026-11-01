import {describe,it,expect,vi} from 'vitest';
import {createCardPointerDrag} from '../src/lib/card-pointer-drag';
const at=(clientX:number,clientY=0,pointerId=1)=>({pointerId,clientX,clientY});
function setup(){
 let captured=false;
 const source={setPointerCapture:vi.fn(()=>{captured=true;}),hasPointerCapture:()=>captured,releasePointerCapture:vi.fn(()=>{captured=false;})};
 const callbacks={move:vi.fn(),drop:vi.fn(),clear:vi.fn()};
 return {source,callbacks,drag:createCardPointerDrag(callbacks)};
}
describe('matching pointer lifecycle',()=>{
 it('releases capture and resets visual state before committing a drop',()=>{
  const {source,callbacks,drag}=setup();
  callbacks.drop.mockImplementation(()=>{expect(source.hasPointerCapture()).toBe(false);expect(callbacks.clear).toHaveBeenCalled();});
  drag.start('first',at(0),source);drag.move(at(30,40));expect(drag.finish(at(30,40))).toBe(true);
  expect(callbacks.drop).toHaveBeenCalledWith('first',at(30,40));expect(source.releasePointerCapture).toHaveBeenCalledOnce();
  // Both the card and window see pointerup: commit exactly once.
  expect(drag.finish(at(30,40))).toBe(false);expect(callbacks.drop).toHaveBeenCalledOnce();
  drag.start('next',at(0),source);drag.move(at(20));drag.finish(at(20));expect(callbacks.drop).toHaveBeenCalledTimes(2);
 });
 it('keeps tap-to-select intact and ignores unrelated pointers',()=>{
  const {source,callbacks,drag}=setup();drag.start('first',at(0),source);drag.move(at(4));drag.move(at(30,0,2));
  expect(drag.finish(at(30,0,2))).toBe(false);expect(drag.finish(at(4))).toBe(false);expect(callbacks.move).not.toHaveBeenCalled();expect(callbacks.drop).not.toHaveBeenCalled();expect(source.hasPointerCapture()).toBe(false);
 });
 it.each(['pointercancel','lostpointercapture','blur','Escape'])('recovers after %s without freezing the next card',()=>{
  const {source,callbacks,drag}=setup();drag.start('first',at(0),source);drag.move(at(20));expect(drag.cancel()).toBe(true);expect(callbacks.drop).not.toHaveBeenCalled();
  expect(source.hasPointerCapture()).toBe(false);drag.start('first',at(0),source);drag.move(at(40));drag.finish(at(40));expect(callbacks.drop).toHaveBeenCalledOnce();
 });
 it('clears the drag even if a card detaches or the answer callback fails',()=>{
  const {source,callbacks,drag}=setup();source.releasePointerCapture.mockImplementation(()=>{throw Error('detached');});callbacks.drop.mockImplementation(()=>{throw Error('save failed');});
  drag.start('first',at(0),source);drag.move(at(20));expect(()=>drag.finish(at(20))).toThrow('save failed');expect(callbacks.clear).toHaveBeenCalledOnce();expect(drag.finish(at(20))).toBe(false);
 });
});
