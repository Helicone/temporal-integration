import { Connection, Client } from '@temporalio/client';
import { repositoryIntegrationWorkflow } from './workflows';
import { nanoid } from 'nanoid';

async function run() {
  // Connect to the Temporal server
  const connection = await Connection.connect({ address: 'localhost:7233' });
  
  const client = new Client({
    connection,
    namespace: 'default',
  });

  // Test with vercel-ai-gateway-testing repo
  const integrationId = nanoid();
  const handle = await client.workflow.start(repositoryIntegrationWorkflow, {
    args: [{
      repoUrl: 'https://github.com/colegottdank/vercel-ai-gateway-testing',
      repoOwner: 'colegottdank',
      repoName: 'vercel-ai-gateway-testing',
      integrationId,
    }],
    taskQueue: 'helicone-integration',
    workflowId: `integration-${integrationId}`,
  });

  console.log(`Started workflow ${handle.workflowId}`);
  
  // Get the result of the Workflow execution
  const result = await handle.result();
  console.log('Workflow completed:', result);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});