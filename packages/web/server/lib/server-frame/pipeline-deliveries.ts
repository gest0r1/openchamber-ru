import { createDispatchResultsRuntime } from '../dispatch-results/runtime.js';
import { startOwnerApprovalContinuations } from '../owner-approval/resume.js';

export function startPipelineDeliveries(options: Parameters<typeof createDispatchResultsRuntime>[0]) {
  const results = createDispatchResultsRuntime(options);
  const unsubscribe = results.start();
  const approvals = startOwnerApprovalContinuations(options);
  return {
    ...results,
    stop: () => {
      approvals.stop();
      unsubscribe();
      results.stop();
    },
  };
}
