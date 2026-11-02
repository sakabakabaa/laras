import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router';
import {describe,expect,it,vi} from 'vitest';
import {BuilderDraftCard} from '../src/components/app/builder/builder-draft-card';

type MockRecord={id:string;getString:(name:string)=>string;getInt:(name:string)=>number;getBool:(name:string)=>boolean;set:(name:string,value:unknown)=>void};
type MockUser={id:string;getString:(name:string)=>string};
type MockApp={findRecordById:ReturnType<typeof vi.fn>;findRecordsByFilter:ReturnType<typeof vi.fn>;save:ReturnType<typeof vi.fn>;delete:ReturnType<typeof vi.fn>};
type Handler=(app:MockApp,user:MockUser,body:Record<string,unknown>)=>unknown;
const service={exports:{} as {handle:Handler}},delivery={exports:{} as {handle:Handler}};
for(const [filename,target] of [['builder-service.js',service],['builder-delivery.js',delivery]] as const){
  runInNewContext(readFileSync(new URL(`../../pocketbase/pb_hooks/${filename}`,import.meta.url),'utf8'),{module:target,__hooks:'',require:()=>({}),BadRequestError:Error,ForbiddenError:Error});
}

function fixture(){
  const values:Record<string,unknown>={owner:'owner',revision:3,deleted:false,document:JSON.stringify({context:{courseId:'course',sectionIds:[]}})};
  const draft:MockRecord={id:'draft0000000001',getString:name=>String(values[name]??''),getInt:name=>Number(values[name]||0),getBool:name=>!!values[name],set:(name,value)=>{values[name]=value;}};
  const user:MockUser={id:'owner',getString:()=> 'faculty'};
  const app:MockApp={findRecordById:vi.fn((collection:string)=>collection==='courses'?{id:'course',getString:()=> 'owner'}:draft),findRecordsByFilter:vi.fn(()=>[]),save:vi.fn(),delete:vi.fn()};
  const command={action:'delete',id:draft.id,baseRevision:3};
  return {app,user,draft,values,command};
}

describe('builder draft deletion',()=>{
  it('removes only the private draft from use, preserving published data and grading records',()=>{
    const {app,user,draft,command}=fixture();
    expect(service.exports.handle(app,user,command)).toEqual({id:draft.id,deleted:true});
    expect(draft.getBool('deleted')).toBe(true);
    expect(app.save).toHaveBeenCalledExactlyOnceWith(draft);
    expect(app.delete).not.toHaveBeenCalled();
    expect(app.findRecordById.mock.calls.map(([collection])=>collection)).toEqual(['builder_documents','courses']);
  });
  it('requires the latest revision before deleting',()=>{
    const {app,user,command,draft}=fixture();
    for(const baseRevision of [undefined,2,4,'3']){
      expect(()=>service.exports.handle(app,user,{...command,baseRevision})).toThrow('REVISION_CONFLICT');
    }
    expect(draft.getBool('deleted')).toBe(false);
    expect(app.save).not.toHaveBeenCalled();
  });
  it('rejects invalid identifiers before looking up a draft',()=>{
    const {app,user,command}=fixture();
    expect(()=>service.exports.handle(app,user,{...command,id:'bad-id'})).toThrow('ID draf tidak valid');
    expect(app.findRecordById).not.toHaveBeenCalled();
  });
  it('does not allow students or another lecturer to delete a draft',()=>{
    const {app,command}=fixture();
    expect(()=>service.exports.handle(app,{id:'owner',getString:()=> 'student'},command)).toThrow('hanya tersedia untuk dosen');
    expect(()=>service.exports.handle(app,{id:'other',getString:()=> 'faculty'},command)).toThrow('Draf tidak tersedia');
    expect(app.save).not.toHaveBeenCalled();
  });
  it('requires ownership of the associated course',()=>{
    const {app,user,command,draft}=fixture();
    app.findRecordById.mockImplementation((collection:string)=>collection==='courses'?{id:'course',getString:()=> 'other'}:draft);
    expect(()=>service.exports.handle(app,user,command)).toThrow('Mata kuliah tidak tersedia');
    expect(app.save).not.toHaveBeenCalled();
  });
  it('allows a safe retry after deletion but blocks opening, saving or publishing the draft',()=>{
    const {app,user,command,values}=fixture();
    values.deleted=true;
    expect(service.exports.handle(app,user,command)).toEqual({id:command.id,deleted:true});
    for(const action of ['get','save'])expect(()=>service.exports.handle(app,user,{...command,action})).toThrow('Draf telah dihapus');
    expect(()=>delivery.exports.handle(app,user,{...command,action:'publish'})).toThrow('Draf telah dihapus');
    expect(app.save).not.toHaveBeenCalled();
  });
  it('does not let an old create retry resurrect a deleted draft',()=>{
    const {app,user,values,draft}=fixture();
    values.deleted=true;
    app.findRecordsByFilter.mockReturnValue([draft]);
    expect(()=>service.exports.handle(app,user,{action:'create',commandId:'original-create'})).toThrow('Draf telah dihapus');
    expect(app.save).not.toHaveBeenCalled();
  });
  it('excludes deleted drafts from both class and assignment listings',()=>{
    const {app,user}=fixture();
    for(const kind of ['kelas','tugas']){
      expect(service.exports.handle(app,user,{action:'list',kind})).toEqual({items:[]});
      expect(app.findRecordsByFilter).toHaveBeenLastCalledWith('builder_documents','owner={:u} && deleted=false && kind={:k}','-updated',100,0,{u:'owner',k:kind});
    }
  });
});

describe('builder draft card',()=>{
  const draft={id:'draft0000000001',title:'Beim Arzt',kind:'kelas' as const,revision:3,updated:'',activityCount:1,courseTitle:'VERSTEHEN A1'};
  it('keeps delete separate from the link that opens the builder',()=>{
    const html=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(BuilderDraftCard,{draft,disabled:false,onDelete:vi.fn()})));
    expect(html).toContain('href="/app/builder/draft0000000001"');
    expect(html).toContain('aria-label="Hapus draf Beim Arzt"');
    expect(html.indexOf('</a>')).toBeLessThan(html.indexOf('<button'));
    expect(html).toContain('type="button"');
  });
  it('passes the specific draft to confirmation and disables deletion while busy',()=>{
    const onDelete=vi.fn();
    const card=BuilderDraftCard({draft,disabled:false,onDelete});
    card.props.children[1].props.onClick();
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(draft);
    const html=renderToStaticMarkup(createElement(MemoryRouter,null,createElement(BuilderDraftCard,{draft,disabled:true,onDelete})));
    expect(html).toContain('disabled=""');
  });
});

it('adds and rolls back the deletion marker without changing existing builder fields',()=>{
  let forward!:(app:unknown)=>void,backward!:(app:unknown)=>void;
  const fields={add:vi.fn(),removeByName:vi.fn()},collection={fields},app={findCollectionByNameOrId:vi.fn(()=>collection),save:vi.fn()};
  runInNewContext(readFileSync(new URL('../../pocketbase/pb_migrations/1793500300_builder_draft_delete.js',import.meta.url),'utf8'),{migrate:(up:typeof forward,down:typeof backward)=>{forward=up;backward=down;},BoolField:class{constructor(public options:unknown){}}});
  forward(app);
  expect(fields.add.mock.calls[0][0].options).toEqual({name:'deleted'});
  backward(app);
  expect(fields.removeByName).toHaveBeenCalledWith('deleted');
  expect(app.save).toHaveBeenCalledTimes(2);
});
