import { Client } from '@temporalio/client';
import { repositoryIntegrationWorkflow } from './workflows';
import { nanoid } from 'nanoid';
import * as dotenv from 'dotenv';
import { createClientConnection, getNamespace } from './utils/temporal-connection';

// Load environment variables
dotenv.config();

async function run() {
  // Get GitHub URL from command line arguments
  const args = process.argv.slice(2);
  let repoUrl = 'https://github.com/colegottdank/test-llm-app'; // default
  
  if (args.length > 0) {
    repoUrl = args[0];
  }

  // Parse owner and repo name from URL
  const urlMatch = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!urlMatch) {
    console.error('Invalid GitHub URL. Expected format: https://github.com/owner/repo');
    process.exit(1);
  }

  const [, repoOwner, repoName] = urlMatch;
  console.log(`\nStarting Helicone integration for: ${repoOwner}/${repoName}`);
  console.log('When deployed to Temporal Cloud, you can start workflows from the UI with this JSON input:');
  
  const integrationId = nanoid();
  const workflowInput = {
    repoUrl: repoUrl.replace(/\.git$/, ''), // Remove .git suffix if present
    repoOwner,
    repoName: repoName.replace(/\.git$/, ''),
    integrationId,
  };
  
  console.log(JSON.stringify(workflowInput, null, 2));
  console.log('\n');

  const connection = await createClientConnection();
  const namespace = getNamespace();
  
  const client = new Client({
    connection,
    namespace,
  });

  const handle = await client.workflow.start(repositoryIntegrationWorkflow, {
    args: [workflowInput],
    taskQueue: 'helicone-integration',
    workflowId: `integration-${integrationId}`,
  });

  console.log(`Started workflow ${handle.workflowId}`);
  console.log(`Namespace: ${namespace}`);
  
  // Get the result of the Workflow execution
  const result = await handle.result();
  console.log('Workflow completed:', result);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});