import { connectHost } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';
import { type checkpoint, panelResponse } from '../shared.js';
import { panelLabels } from './labels.js';

function element<T extends HTMLElement>(selector: string) {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing approval panel element ${selector}`);
  return node;
}

const status = element('#status');
const projects = element('#projects');
const refresh = element<HTMLButtonElement>('#refresh');
const older = element<HTMLButtonElement>('#older');

const host = connectHost();
const entries = new Map<string, ReturnType<typeof checkpoint.parse>>();
let labels = panelLabels('en');
let origin = '';
let before = 0;
let loading = false;

function action(label: string, run: () => Promise<void>) {
  const button = document.createElement('button');
  button.textContent = label;
  button.addEventListener('click', () => void run().catch(() => { status.textContent = labels.unavailable; }));
  return button;
}

function render() {
  const groups = new Map<string, HTMLUListElement>();
  projects.replaceChildren();
  const sorted = [...entries.values()].sort((left, right) => Number(right.decision === 'pending') - Number(left.decision === 'pending'));
  for (const entry of sorted) {
    const project = entry.project || entry.workspace.slice(0, 12);
    const group = groups.get(project) ?? document.createElement('ul');
    if (!groups.has(project)) {
      groups.set(project, group);
      const title = document.createElement('h2');
      title.textContent = project;
      projects.append(title, group);
    }
    const row = document.createElement('li');
    const details = document.createElement('span');
    const scope = entry.pipeline_id === 'all' ? entry.operation : `${entry.pipeline_id}/${entry.stage}`;
    details.textContent = [entry.run_id, scope, entry.candidate_sha, labels.decisions[entry.decision]].filter(Boolean).join(' · ');
    row.append(details);
    if (entry.decision === 'pending') row.append(action(labels.review, () => host.openUrl(`${origin}/approval/${entry.request_id}`)));
    row.append(action(labels.session, () => host.openSession(entry.session_id)));
    group.append(row);
  }
}

async function load(cursor: number) {
  if (loading) return;
  loading = true;
  refresh.disabled = older.disabled = true;
  try {
    const reply = await host.serviceRequest({ method: 'GET', path: '/checkpoints', query: { before: String(cursor) } });
    if (reply.status !== 200) throw new Error('Approval service unavailable');
    const page = panelResponse.parse(JSON.parse(reply.body));
    origin = page.origin;
    before = page.before;
    if (!cursor) entries.clear();
    for (const entry of page.entries) entries.set(entry.request_id, entry);
    status.textContent = entries.size ? '' : labels.empty;
    render();
  } catch {
    status.textContent = labels.unavailable;
    entries.clear();
    before = 0;
    render();
  } finally {
    older.hidden = before === 0;
    refresh.disabled = older.disabled = false;
    loading = false;
  }
}

refresh.addEventListener('click', () => void load(0));
older.addEventListener('click', () => void load(before));
host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  labels = panelLabels(context.locale);
  refresh.textContent = labels.refresh;
  older.textContent = labels.older;
  void load(0);
});
window.addEventListener('focus', () => void load(0));
