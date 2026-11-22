import test from 'node:test';
import assert from 'node:assert/strict';
import { separatePtyLaunch, assertRootExecutionDisabled } from './root-execution-boundary.js';
const env={OPENCHAMBER_UI_PASSWORD:'sensitive',OPENCODE_PASSWORD:'sensitive',GH_TOKEN:'sensitive',PATH:'/root/.local/bin',LANG:'C',TERM:'xterm-256color'};
test('nonroot PTY preserved',()=>assert.equal(separatePtyLaunch({executable:'/bin/bash',args:['-l'],env},{uid:1001}).executable,'/bin/bash'));
test('root PTY must use unprivileged opencode',()=>{
 const r=separatePtyLaunch({executable:'/bin/bash',args:['-l'],env},{uid:0,platform:'linux',mode:'separated',target:'opencode'});
 assert.equal(r.executable,'/usr/bin/setpriv');
 assert.deepEqual(r.args,['--reuid=opencode','--regid=opencode','--init-groups','--','/bin/bash','-l']);
 assert.equal(r.env.USER,'opencode');
 for(const s of ['GH_TOKEN','OPENCHAMBER_UI_PASSWORD','OPENCODE_PASSWORD'])assert.equal(r.env[s],undefined);
 assert.equal(r.env.HOME,'/home/opencode');
});
test('missing root separation fails closed',()=>{
 assert.throws(()=>separatePtyLaunch({executable:'/bin/bash',args:[],env},{uid:0,platform:'linux',mode:'',target:'opencode'}),/FORBIDDEN/);
 assert.throws(()=>separatePtyLaunch({executable:'/bin/bash',args:[],env},{uid:0,platform:'linux',mode:'separated',target:'root'}),/FORBIDDEN/);
 assert.throws(()=>assertRootExecutionDisabled('workflow',{uid:0}),/FORBIDDEN/);
});