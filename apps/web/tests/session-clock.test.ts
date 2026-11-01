import {describe,it,expect} from 'vitest';
import {sessionClock} from '../src/lib/session-clock';
describe('HH:MM:SS session countdown',()=>{
 it.each([[0,'00:00:00'],[59,'00:00:59'],[60,'00:01:00'],[3600,'01:00:00'],[12410,'03:26:50'],[-1,'00:00:00'],[Infinity,'00:00:00'],[NaN,'00:00:00']])('formats %s as %s',(value,label)=>expect(sessionClock(value)).toBe(label));
});
