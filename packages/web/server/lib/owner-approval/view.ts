export const page = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pipeline approval</title>
<main><h1>Pipeline approval</h1>
<p id="status" role="status" aria-live="polite">Loading request…</p>
<dl id="details"></dl>
<details><summary>Frozen request</summary><pre id="snapshot"></pre></details>
<p><button id="approve" disabled>Approve with passkey</button>
<button id="reject" disabled>Reject with passkey</button></p>
</main><script src="/approval.js" defer></script></html>`;

export const enrollmentPage = `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Register owner passkey</title><main><h1>Register owner passkey</h1>
<p id="status" role="status" aria-live="polite"></p><button id="enroll">Register passkey</button>
</main><script src="/enroll.js" defer></script></html>`;

export const enrollmentScript = `
const token = location.hash.slice(1);
history.replaceState(null, '', location.pathname);
const status = document.getElementById('status');
const button = document.getElementById('enroll');
const bytes = (encoded) => Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
const post = (path, value) => fetch('/api/enroll/' + path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(value)});
button.disabled = !token;
if (!token) status.textContent = 'Open the one-time link provided by your administrator.';
button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    const response = await post('options', {token});
    if (!response.ok) throw new Error('Enrollment unavailable');
    const options = await response.json();
    const credential = await navigator.credentials.create({publicKey:{...options, challenge:bytes(options.challenge), user:{...options.user,id:bytes(options.user.id)}}});
    const verified = await post('verify', {token, credential:credential.toJSON()});
    if (!verified.ok) throw new Error('Enrollment rejected');
    status.textContent = 'Passkey registered.';
  } catch {
    status.textContent = 'Registration failed. Try again or request a new enrollment link.';
    button.disabled = false;
  }
});
`;

export const pageScript = `
const id = encodeURIComponent(location.pathname.split('/').at(-1));
const api = '/api/approval/' + id;
const status = document.getElementById('status');
const buttons = [document.getElementById('approve'), document.getElementById('reject')];
const bytes = (encoded) => Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
const post = async (path, value) => {
  const response = await fetch(api + path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(value)});
  if (!response.ok) throw new Error('The request could not be confirmed.');
  return response.json();
};
const decide = async (decision) => {
  buttons.forEach((button) => button.disabled = true);
  status.textContent = 'Waiting for your passkey…';
  try {
    const options = await post('/challenge', {decision});
    const assertion = await navigator.credentials.get({publicKey:{...options, challenge:bytes(options.challenge),
      allowCredentials:options.allowCredentials.map((credential) => ({...credential, id:bytes(credential.id)}))}});
    const result = await post('/verify', {challenge:options.challenge, assertion:assertion.toJSON()});
    status.textContent = result.decision === 'approved' ? 'Request approved.' : 'Request rejected.';
  } catch {
    status.textContent = 'The request was not confirmed. You can try again.';
    buttons.forEach((button) => button.disabled = false);
  }
};
fetch(api).then((response) => {
  if (!response.ok) throw new Error('Request unavailable');
  return response.json();
}).then((request) => {
  const details = document.getElementById('details');
  for (const [label, value] of [['Run',request.run_id],['Session',request.session_id],['Workspace SHA-256',request.workspace],
    ['Operation',request.operation],['Pipeline',request.pipeline_id],['Stage',request.stage],
    ['Generation',request.generation],['Manifest SHA-256',request.manifest_sha256],['Subject SHA-256',request.subject_sha256],['Candidate SHA',request.candidate_sha]]) {
    if (value === '') continue;
    const name = document.createElement('dt');
    name.textContent = label;
    const element = document.createElement('dd');
    element.textContent = value;
    details.append(name,element);
  }
  document.getElementById('snapshot').textContent = JSON.stringify(JSON.parse(request.snapshot),null,2);
  status.textContent = 'Review the frozen request before confirming.';
  buttons.forEach((button) => {button.disabled = false; button.addEventListener('click', () => decide(button.id));});
}).catch(() => {status.textContent = 'The request is unavailable or is no longer pending.';});
`;
