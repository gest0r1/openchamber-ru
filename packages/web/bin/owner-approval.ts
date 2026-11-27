import process from 'node:process';
import { createServer } from 'node:http';
import { createOwnerApprovalService } from '../server/lib/owner-approval/service.js';

const origin = process.env.OPENCHAMBER_OWNER_APPROVAL_ORIGIN;
if (!origin || process.getuid?.() === 0 || process.env.LISTEN_FDS !== '1'
    || process.env.LISTEN_PID !== String(process.pid)) {
  throw new Error('The owner approval service requires its fixed HTTPS origin and a systemd-owned listener');
}
createServer(createOwnerApprovalService({ origin })).listen({ fd: 3 });
