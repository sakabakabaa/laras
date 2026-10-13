import { describe, it, expect } from 'vitest';
import { relationRecords } from '@/lib/learning';
describe('legacy file relation expansions',()=>{
 it('supports old single-course and new multi-course shapes',()=>{
  const record={id:'course',title:'Course'};
  expect(relationRecords(record).find(r=>r.id==='course')?.title).toBe('Course');
  expect(relationRecords([record])).toEqual([record]);
  expect(relationRecords(undefined)).toEqual([]);
 });
});
