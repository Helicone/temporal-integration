import { proxyActivities, sleep, defineSignal, setHandler, condition } from '@temporalio/workflow';
import type * as activities from './activities';

const { 
  forkRepository,
  analyzeRepository, 
  runClaudeCode,
  createStagingBranch,
  createPullRequest,
  updateIntegrationStatus
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 minutes',
  retry: {
    initialInterval: '30s',
    maximumInterval: '5m',
    maximumAttempts: 3,
  }
});

// Claude Code needs more time
const { runClaudeCode: runClaudeCodeLong } = proxyActivities<typeof activities>({
  startToCloseTimeout: '20 minutes',
  retry: {
    initialInterval: '30s',
    maximumInterval: '5m',
    maximumAttempts: 2,
  }
});

export interface RepositoryIntegrationInput {
  repoUrl: string;
  repoOwner: string;
  repoName: string;
  integrationId: string;
}

export interface ReviewDecision {
  approved: boolean;
  feedback?: string;
  modifiedCode?: string;
}

// Define signals for human interaction
export const reviewCompleteSignal = defineSignal<[ReviewDecision]>('reviewComplete');

export async function repositoryIntegrationWorkflow(
  input: RepositoryIntegrationInput
): Promise<void> {
  try {
    // Step 1: Fork the repository
    await updateIntegrationStatus({
      integrationId: input.integrationId,
      status: 'forking',
      message: 'Forking repository...'
    });
    
    const forkResult = await forkRepository({
      owner: input.repoOwner,
      repo: input.repoName
    });

    // Step 2: Clone the repository
    await updateIntegrationStatus({
      integrationId: input.integrationId,
      status: 'cloning',
      message: 'Cloning repository...'
    });

    // Simple clone - just get the repo path
    const { repoPath } = await analyzeRepository({
      repoUrl: forkResult.cloneUrl,
      branch: forkResult.defaultBranch
    });

    // Step 3: Run Claude Code to add Helicone integration
    await updateIntegrationStatus({
      integrationId: input.integrationId,
      status: 'integrating',
      message: 'Running Claude Code to add Helicone integration...'
    });

    const claudeResult = await runClaudeCodeLong({
      repoPath: repoPath,
      analysis: {}, // Claude Code doesn't need our analysis
      task: 'Add Helicone integration'
    });

    // Step 4: Create staging branch and push changes
    await updateIntegrationStatus({
      integrationId: input.integrationId,
      status: 'pushing',
      message: 'Creating staging branch with changes...'
    });

    const stagingBranch = await createStagingBranch({
      repoPath: repoPath,
      changes: claudeResult.changes,
      branchName: `helicone-integration-${input.integrationId}`
    });

    // Step 5: Create pull request
    await updateIntegrationStatus({
      integrationId: input.integrationId,
      status: 'creating_pr',
      message: 'Creating pull request...'
    });

    const pr = await createPullRequest({
      owner: forkResult.forkOwner,
      repo: forkResult.forkName,
      head: stagingBranch.branchName,
      title: 'Add Helicone observability integration',
      body: `## Summary\n\nThis PR adds Helicone observability to track and monitor LLM usage.\n\n${claudeResult.summary}\n\n## Changes\n\n${claudeResult.changesSummary}\n\n---\n\n*This PR was generated with [Helicone Temporal Integration](https://github.com/Helicone/helicone)*`
    });

    await updateIntegrationStatus({
      integrationId: input.integrationId,
      status: 'completed',
      message: 'Successfully created pull request!',
      prUrl: pr.url
    });

    console.log('Integration completed:', { pr: pr.url });

  } catch (error) {
    await updateIntegrationStatus({
      integrationId: input.integrationId,
      status: 'failed',
      message: `Integration failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
    throw error;
  }
}