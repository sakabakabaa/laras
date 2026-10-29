import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
let base=process.argv[2]||'';
if(base && !/^[a-f0-9]{40}$/i.test(base))throw new Error('Expected a full Git commit SHA for changed-file lint.');
if(!base || /^0+$/.test(base)){
  try{base=git('rev-parse','HEAD^');}catch{base='';}
}
const args=base?['diff','--name-only','--diff-filter=ACMR','-z',`${base}...HEAD`]:['diff-tree','--root','--no-commit-id','--name-only','--diff-filter=ACMR','-r','-z','HEAD'];
const files=git(...args).split('\0').filter(path=>path.startsWith('apps/web/')&&/\.(ts|tsx)$/.test(path)&&!path.includes('/.react-router/')).map(path=>path.slice('apps/web/'.length));
if(!files.length){console.log('No changed web TypeScript files to lint.');process.exit(0);}
console.log(`Linting ${files.length} changed TypeScript files.`);
const result=spawnSync(process.execPath,[resolve(root,'node_modules/eslint/bin/eslint.js'),'--quiet','--no-warn-ignored',...files],{cwd:resolve(root,'apps/web'),stdio:'inherit'});
if(result.error)throw result.error;
process.exit(result.status??1);
