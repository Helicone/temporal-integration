import { Connection, Client } from '@temporalio/client';
import { reviewChangesSignal } from './workflows';

async function sendReview() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: npm run review <workflow-id> <approve|reject> [feedback]');
    console.error('Example: npm run review integration-abc123 approve');
    console.error('Example: npm run review integration-abc123 reject "Need to fix error handling"');
    process.exit(1);
  }

  const [workflowId, decision, ...feedbackParts] = args;
  const feedback = feedbackParts.join(' ');
  const approved = decision.toLowerCase() === 'approve';

  // Connect to the Temporal server
  const connection = await Connection.connect({ address: 'localhost:7233' });
  
  const client = new Client({
    connection,
    namespace: 'default',
  });

  try {
    const handle = client.workflow.getHandle(workflowId);
    
    await handle.signal(reviewChangesSignal, {
      approved,
      feedback: feedback || undefined
    });

    console.log(`Review sent successfully!`);
    console.log(`Workflow: ${workflowId}`);
    console.log(`Decision: ${approved ? 'APPROVED ✅' : 'REJECTED ❌'}`);
    if (feedback) {
      console.log(`Feedback: ${feedback}`);
    }
  } catch (error) {
    console.error('Error sending review:', error);
    process.exit(1);
  }
}

sendReview().catch((err) => {
  console.error(err);
  process.exit(1);
});