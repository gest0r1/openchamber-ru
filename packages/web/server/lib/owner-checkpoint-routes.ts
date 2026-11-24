import { createConnection } from 'node:net';

import { z } from 'zod';
import type { Application, ExpressFactory } from './shared/http-contracts.js';
import type { createUiAuth } from './ui-auth/ui-auth.js';

type OwnerRequest = { action: 'list' } | { action: 'approve' | 'reject'; request_id: string };
type OwnerRoutes = {
  express: ExpressFactory;
  uiAuthController?: Pick<ReturnType<typeof createUiAuth>, 'enabled' | 'requireSessionAuth'> | null;
  processObject?: Pick<NodeJS.Process, 'env' | 'getuid'>;
  broker?: typeof brokerRequest;
};

const decisionSchema = z.object({ decision: z.enum(['approve', 'reject']) });
const brokerResponse = z.object({ ok: z.json().optional(), error: z.string().optional() });

const SOCKET = '/run/my-opencode-approval/owner.sock';
const REQUEST = /^[a-f0-9]{32}$/;

export const brokerRequest = (data: OwnerRequest, socketPath = SOCKET) => new Promise((resolve, reject) => {
  const socket = createConnection(socketPath);
  let buffer = '';
  const timer = setTimeout(() => socket.destroy(new Error('OWNER_BROKER_TIMEOUT')), 4000);
  socket.once('connect', () => socket.write(JSON.stringify(data) + '\n'));
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    if (buffer.length > 32768) return socket.destroy(new Error('OWNER_BROKER_RESPONSE_TOO_LARGE'));
    if (!buffer.includes('\n')) return;
    const line = buffer.split('\n', 1)[0];
    clearTimeout(timer);
    socket.destroy();
    try {
      const parsed = brokerResponse.parse(JSON.parse(line ?? ''));
      if (parsed?.error) return reject(new Error(String(parsed.error)));
      if (!parsed?.ok) return reject(new Error('OWNER_BROKER_INVALID_RESPONSE'));
      resolve(parsed.ok);
    } catch (error) { reject(error); }
  });
  socket.once('error', (error) => { clearTimeout(timer); reject(error); });
  socket.once('close', () => {
    clearTimeout(timer);
    reject(new Error('OWNER_BROKER_CLOSED'));
  });
});

const page = `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Подтверждения владельца</title><style>body{font:16px system-ui,sans-serif;max-width:840px;margin:24px auto;padding:0 14px;color:#212121}article{border:1px solid #ccc;padding:16px;margin:14px 0;border-radius:8px}pre{overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}button{font:inherit;padding:8px 14px;margin-right:10px;cursor:pointer}.deny{color:#a21a1a}</style></head><body><h1>Подтверждения владельца</h1><p>Проверяйте RUN и SHA перед решением. Неподтверждённые запросы не запускаются автоматически.</p><div id="items">Загрузка...</div><script>
async function load(){const el=document.getElementById('items');try{const r=await fetch('/api/openchamber/owner-approvals',{credentials:'same-origin'});if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();el.replaceChildren();if(!d.pending.length){el.textContent='Ожидающих подтверждений нет';return;}for(const x of d.pending){const art=document.createElement('article');const h=document.createElement('h2');h.textContent=x.checkpoint.operation+' — '+x.checkpoint.run_id;art.append(h);const pre=document.createElement('pre');pre.textContent=JSON.stringify(x.checkpoint,null,2);art.append(pre);for(const op of ['approve','reject']){const b=document.createElement('button');b.textContent=op==='approve'?'Подтвердить':'Отклонить';if(op==='reject')b.className='deny';b.onclick=async()=>{if(!window.confirm((op==='approve'?'Подтвердить':'Отклонить')+' именно этот SHA?'))return;b.disabled=true;try{const rr=await fetch('/api/openchamber/owner-approvals/'+x.id,{method:'POST',headers:{'Content-Type':'application/json','X-Owner-Interaction':'1'},credentials:'same-origin',body:JSON.stringify({decision:op})});if(!rr.ok)throw Error('HTTP '+rr.status);await load();}catch(e){alert(String(e));b.disabled=false;}};art.append(b);}el.append(art);}}catch(e){el.textContent='Ошибка загрузки: '+e.message;}}load();
</script></body></html>`;

export const registerOwnerCheckpointRoutes = (app: Application, { express, uiAuthController, processObject = process, broker = brokerRequest }: OwnerRoutes) => {
  if (processObject.getuid?.() !== 0 || processObject.env?.OPENCHAMBER_ROOT_MODE !== 'separated') return false;
  if (!uiAuthController?.enabled || !uiAuthController.requireSessionAuth) {
    throw new Error('OWNER_UI_AUTH_REQUIRED: root mode must have password-protected session auth');
  }
  const auth = uiAuthController.requireSessionAuth;
  app.get('/owner-approvals', auth, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'");
    res.type('html').send(page);
  });
  app.get('/api/openchamber/owner-approvals', auth, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { res.json(await broker({ action: 'list' })); }
    catch { res.status(503).json({ error: 'OWNER_BROKER_UNAVAILABLE' }); }
  });
  app.post('/api/openchamber/owner-approvals/:id', auth, express.json({ limit: '4kb' }), async (req, res) => {
    if (req.header('X-Owner-Interaction') !== '1') return res.status(403).json({ error: 'OWNER_INTERACTION_REQUIRED' });
    const origin = req.header('Origin');
    const originHeader = z.string().safeParse(origin);
    const originUrl = originHeader.success ? URL.parse(originHeader.data) : null;
    if (!originUrl || !['http:', 'https:'].includes(originUrl.protocol) ||
        originUrl.host !== req.header('Host')) return res.status(403).json({ error: 'OWNER_ORIGIN_REQUIRED' });
    const id = req.params.id;
    const decision = decisionSchema.safeParse(req.body);
    if (!id || !REQUEST.test(id) || !decision.success) return res.status(400).json({ error: 'INVALID_DECISION' });
    try { res.setHeader('Cache-Control', 'no-store'); res.json(await broker({ action: decision.data.decision, request_id: id })); }
    catch { res.status(503).json({ error: 'OWNER_BROKER_UNAVAILABLE' }); }
  });
  return true;
};
