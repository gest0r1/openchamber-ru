import test from 'node:test';
import assert from 'node:assert/strict';
import { registerOwnerCheckpointRoutes } from './owner-checkpoint-routes.js';

const makeApp = () => {
  const endpoints = {};
  return {
    endpoints,
    get(path, ...handlers) { endpoints['GET '+path] = handlers; },
    post(path, ...handlers) { endpoints['POST '+path] = handlers; },
  };
};
const auth = { enabled: true, requireSessionAuth: (_req,_res,next) => next() };
const express = {json:()=> (_req,_res,next)=>next()};
const fakeRes = () => ({statusCode:200,headers:{}, setHeader(k,v){this.headers[k]=v;return this},header(k){return this.headers[k]},status(code){this.statusCode=code;return this},json(payload){this.body=payload;return this},type(){return this},send(html){this.html=html;return this}});
const invoke = async (handlers, req, res) => {
  for(const h of handlers){
    if(res.body || res.html)break;
    if(h.length===3){let next=false;await h(req,res,()=>{next=true});if(!next)break;}
    else await h(req,res);
  }
};

test('owner decisions are unavailable when OpenChamber does not run under protected root mode',()=>{
  const a=makeApp();
  assert.equal(registerOwnerCheckpointRoutes(a,{express,uiAuthController:auth,processObject:{getuid:()=>1001,env:{OPENCHAMBER_ROOT_MODE:'separated'}}}),false);
  assert.equal(Object.keys(a.endpoints).length,0);
});

test('root mode fails closed without UI session authentication',()=>{
  assert.throws(()=>registerOwnerCheckpointRoutes(makeApp(),{express,uiAuthController:{enabled:false},processObject:{getuid:()=>0,env:{OPENCHAMBER_ROOT_MODE:'separated'}}}),/OWNER_UI_AUTH_REQUIRED/);
});

test('root decision endpoint requires CSRF intent and exact origin',async()=>{
  const app=makeApp(),decisions=[];
  assert.equal(registerOwnerCheckpointRoutes(app,{express,uiAuthController:auth,processObject:{getuid:()=>0,env:{OPENCHAMBER_ROOT_MODE:'separated'}},broker:async x=>{decisions.push(x);return {ok:true}}}),true);
  const endpoint=app.endpoints['POST /api/openchamber/owner-approvals/:id'];
  const id='f'.repeat(32), makeReq=(origin,intent='1')=>({params:{id},body:{decision:'approve'},header(name){return ({'X-Owner-Interaction':intent,Origin:origin,Host:'localhost:3000'})[name]}});
  let res=fakeRes();await invoke(endpoint,makeReq('http://evil.invalid'),res);assert.equal(res.statusCode,403);
  res=fakeRes();await invoke(endpoint,makeReq('http://localhost:3000','0'),res);assert.equal(res.statusCode,403);
  res=fakeRes();await invoke(endpoint,makeReq('http://localhost:3000'),res);assert.equal(res.statusCode,200);
  assert.deepEqual(decisions,[{action:'approve',request_id:id}]);
});