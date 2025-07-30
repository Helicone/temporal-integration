import { proxyActivities, defineSignal, setHandler, condition } from '@temporalio/workflow';
import type * as activities from './activities';

// Configure activity proxies with proper timeouts
const defaultActivities = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 minutes',
  retry: {
    initialInterval: '30s',
    maximumInterval: '5m',
    maximumAttempts: 3,
  },
});

// Override specific activities that need different settings
const { runClaudeCode, applyClaudeCodeFeedback } = proxyActivities<
  Pick<typeof activities, 'runClaudeCode' | 'applyClaudeCodeFeedback'>
>({
  startToCloseTimeout: '20 minutes',
  retry: {
    initialInterval: '30s',
    maximumInterval: '5m',
    maximumAttempts: 2,
  },
});

// Use default timeout for other activities
const { forkRepository, cloneRepository, createStagingBranch, createPullRequest, updateIntegrationStatus } =
  defaultActivities;

export interface RepositoryIntegrationInput {
  repoUrl: string;
  repoOwner: string;
  repoName: string;
  integrationId: string;
}

export interface ReviewDecision {
  approved: boolean;
  feedback?: string;
}

interface ForkResult {
  forkOwner: string;
  forkName: string;
  cloneUrl: string;
  defaultBranch: string;
}

// Define signals for human interaction
export const reviewChangesSignal = defineSignal<[ReviewDecision]>('reviewChanges');

export async function repositoryIntegrationWorkflow(input: RepositoryIntegrationInput): Promise<void> {
  let reviewDecision: ReviewDecision | undefined;

  // Set up signal handler for review - this persists for the entire workflow
  setHandler(reviewChangesSignal, (decision: ReviewDecision) => {
    console.log('[Workflow] Signal received:', JSON.stringify(decision));
    console.log('[Workflow] Type of decision:', typeof decision);
    console.log('[Workflow] Decision.approved:', decision.approved, 'Type:', typeof decision.approved);
    console.log('[Workflow] Decision.feedback:', decision.feedback, 'Type:', typeof decision.feedback);
    reviewDecision = decision;
  });

  try {
    // Step 1: Fork and clone repository
    const { repoPath, forkInfo } = await setupRepository(input);

    // Step 2: Integration loop - allows retry with feedback
    const integrationResult = await performIntegration(
      input,
      repoPath,
      forkInfo,
      () => reviewDecision,
      () => {
        reviewDecision = undefined;
      }, // Reset function
    );

    if (!integrationResult) {
      // Workflow already updated status, just return
      return;
    }

    const { branchName, attemptCount, claudeSessionId } = integrationResult;

    // Step 3: Create final pull request to original repo
    await createFinalPullRequest(input, forkInfo, branchName, attemptCount, claudeSessionId);
  } catch (error) {
    await updateIntegrationStatus({
      integrationId: input.integrationId,
      status: 'failed',
      message: `Integration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
    throw error;
  }
}

async function setupRepository(input: RepositoryIntegrationInput): Promise<{ repoPath: string; forkInfo: ForkResult }> {
  // Fork the repository
  await updateIntegrationStatus({
    integrationId: input.integrationId,
    status: 'forking',
    message: 'Forking repository...',
  });

  const forkInfo = await forkRepository({
    owner: input.repoOwner,
    repo: input.repoName,
  });

  // Clone the repository
  await updateIntegrationStatus({
    integrationId: input.integrationId,
    status: 'cloning',
    message: 'Cloning repository...',
  });

  const { repoPath } = await cloneRepository({
    repoUrl: forkInfo.cloneUrl,
    branch: forkInfo.defaultBranch,
  });

  return { repoPath, forkInfo };
}

async function performIntegration(
  input: RepositoryIntegrationInput,
  repoPath: string,
  forkInfo: ForkResult,
  getReviewDecision: () => ReviewDecision | undefined,
  resetReviewDecision: () => void,
): Promise<{ branchName: string; attemptCount: number; claudeSessionId?: string } | null> {
  // Step 1: Initial integration
  const claudeResult = await runClaudeIntegration(input, repoPath);

  if (!claudeResult) {
    return null; // No changes needed
  }

  const branchName = `helicone-integration-${input.integrationId}`;
  const sessionId = claudeResult.sessionId;

  // Create staging branch and PR for review
  await createReviewPullRequest(input, repoPath, claudeResult, branchName, 1, undefined, forkInfo);

  // Step 2: Review loop
  let attemptCount = 1;
  let integrationComplete = false;

  while (!integrationComplete && attemptCount < 3) {
    console.log(`[Workflow] Waiting for review (attempt ${attemptCount})...`);

    // Reset any previous review decision before waiting for a new one
    resetReviewDecision();

    const reviewDecision = await waitForReview(input, getReviewDecision);

    if (!reviewDecision) {
      console.log('[Workflow] Review timed out');
      return null; // Timeout
    }

    console.log('[Workflow] Review received:', reviewDecision);

    if (reviewDecision.approved) {
      console.log('[Workflow] Changes approved!');
      integrationComplete = true;
    } else if (!reviewDecision.feedback) {
      console.log('[Workflow] Rejected without feedback');
      await updateIntegrationStatus({
        integrationId: input.integrationId,
        status: 'rejected',
        message: 'Changes rejected without feedback',
      });
      throw new Error('Changes rejected without feedback');
    } else {
      // Apply feedback to the existing PR
      attemptCount++;
      console.log(`[Workflow] Applying feedback: "${reviewDecision.feedback}"`);

      await updateIntegrationStatus({
        integrationId: input.integrationId,
        status: 'applying_feedback',
        message: `Applying feedback (attempt ${attemptCount})...`,
      });

      const feedbackResult = await applyClaudeCodeFeedback({
        repoPath,
        sessionId: sessionId!,
        feedback: reviewDecision.feedback,
        branchName,
      });

      if (!feedbackResult.success) {
        console.log('[Workflow] Failed to apply feedback:', feedbackResult.summary);
        await updateIntegrationStatus({
          integrationId: input.integrationId,
          status: 'failed',
          message: 'Failed to apply feedback: ' + feedbackResult.summary,
        });
        return null;
      }

      console.log('[Workflow] Feedback applied successfully');
      await updateIntegrationStatus({
        integrationId: input.integrationId,
        status: 'awaiting_review',
        message: 'Feedback applied. Awaiting re-review...',
      });
    }
  }

  if (!integrationComplete) {
    await updateIntegrationStatus({
      integrationId: input.integrationId,
      status: 'rejected',
      message: 'Maximum feedback attempts reached',
    });
    throw new Error('Maximum feedback attempts reached');
  }

  return { branchName, attemptCount, claudeSessionId: sessionId };
}

async function runClaudeIntegration(input: RepositoryIntegrationInput, repoPath: string) {
  await updateIntegrationStatus({
    integrationId: input.integrationId,
    status: 'integrating',
    message: 'Running Claude Code to add Helicone integration...',
  });

  const claudeResult = await runClaudeCode({
    repoPath,
    analysis: {},
    task: 'Add Helicone integration',
  });

  // Check if Claude Code made any changes
  const hasChanges =
    (claudeResult.changes.modifiedFiles?.length ?? 0) > 0 || (claudeResult.changes.addedFiles?.length ?? 0) > 0;

  if (!hasChanges) {
    await updateIntegrationStatus({
      integrationId: input.integrationId,
      status: 'completed',
      message: 'No changes needed - this repository may not use supported LLM providers directly.',
    });
    return null;
  }

  return claudeResult;
}

async function createReviewPullRequest(
  input: RepositoryIntegrationInput,
  repoPath: string,
  claudeResult: any,
  branchName: string,
  attemptCount: number,
  reviewDecision: ReviewDecision | undefined,
  forkInfo: ForkResult,
) {
  // Create staging branch
  await updateIntegrationStatus({
    integrationId: input.integrationId,
    status: 'pushing',
    message: 'Creating staging branch with changes...',
  });

  await createStagingBranch({
    repoPath,
    changes: claudeResult.changes,
    branchName,
  });

  // Create PR in fork for review
  await updateIntegrationStatus({
    integrationId: input.integrationId,
    status: 'creating_review_pr',
    message: 'Creating pull request in fork for review...',
  });

  const reviewPr = await createPullRequest({
    owner: forkInfo.forkOwner,
    repo: forkInfo.forkName,
    head: branchName,
    base: forkInfo.defaultBranch,
    title: `[REVIEW] Add Helicone observability integration`,
    body: formatReviewPRBody(input, claudeResult),
  });

  await updateIntegrationStatus({
    integrationId: input.integrationId,
    status: 'awaiting_review',
    message: 'Review PR created. Awaiting review...',
    stagingUrl: reviewPr.url,
  });
}

async function waitForReview(
  input: RepositoryIntegrationInput,
  getReviewDecision: () => ReviewDecision | undefined,
): Promise<ReviewDecision | null> {
  console.log('[Workflow] Waiting for review signal...');

  // Wait for review signal (max 7 days)
  const received = await condition(() => getReviewDecision() !== undefined, '7 days');

  if (!received) {
    await updateIntegrationStatus({
      integrationId: input.integrationId,
      status: 'failed',
      message: 'Review timed out after 7 days.',
    });
    return null;
  }

  const decision = getReviewDecision()!;
  console.log('[Workflow] Review decision received:', decision);
  return decision;
}

async function createFinalPullRequest(
  input: RepositoryIntegrationInput,
  forkInfo: ForkResult,
  branchName: string,
  attemptCount: number,
  sessionId?: string,
) {
  await updateIntegrationStatus({
    integrationId: input.integrationId,
    status: 'creating_pr',
    message: 'Review approved! Creating pull request to original repository...',
  });

  const finalPr = await createPullRequest({
    owner: input.repoOwner,
    repo: input.repoName,
    head: `${forkInfo.forkOwner}:${branchName}`,
    base: 'main',
    title: '🚀 Add Helicone observability for LLM monitoring',
    body: formatFinalPRBody(attemptCount, sessionId),
  });

  await updateIntegrationStatus({
    integrationId: input.integrationId,
    status: 'completed',
    message: 'Successfully created pull request!',
    prUrl: finalPr.url,
  });
}

// Helper functions

function formatReviewPRBody(input: RepositoryIntegrationInput, claudeResult: any): string {
  return `## 🔍 Review Required

This PR adds Helicone observability to track and monitor LLM usage.

${claudeResult.summary}

## Changes

${claudeResult.changesSummary}

## Next Steps

1. Review the changes in this PR
2. If approved, run: \`npm run review ${input.integrationId} approve\`
3. If changes needed, run: \`npm run review ${input.integrationId} reject "feedback here"\`

---

*This PR was generated with [Helicone Temporal Integration](https://github.com/Helicone/helicone)*`;
}

function formatFinalPRBody(attemptCount: number, sessionId?: string): string {
  let body = `## 🚀 Add Helicone Observability for LLM Monitoring

This PR integrates [Helicone](https://helicone.ai) to provide comprehensive observability for your LLM API calls.

### 🎯 What is Helicone?

Helicone is a proxy-based observability platform that provides:
- **Real-time monitoring** of all LLM API calls
- **Cost tracking** and usage analytics
- **Latency metrics** and performance insights
- **Error tracking** and debugging tools
- **Custom tagging** and filtering capabilities
- **Zero latency overhead** (adds <10ms)

### 💡 Benefits for Your Application

1. **Cost Control**: Track exactly how much you're spending on LLM APIs
2. **Performance Monitoring**: Identify slow requests and optimize accordingly
3. **Error Detection**: Catch and debug API failures quickly
4. **Usage Analytics**: Understand which features consume the most tokens
5. **Compliance**: Maintain audit logs of all LLM interactions

### 🔧 How It Works

This integration routes your existing LLM API calls through Helicone's proxy endpoints. No new dependencies are added - just configuration changes to your existing LLM clients.

### 📊 Next Steps

1. Set your \`HELICONE_API_KEY\` environment variable
2. Visit your [Helicone Dashboard](https://helicone.ai/dashboard) to view metrics
3. Set up alerts for cost thresholds or error rates

`;

  if (attemptCount > 1) {
    body += `### 🔄 Review Process

This integration was refined through ${attemptCount} iterations based on review feedback.

`;
  }

  body += `---

*This PR was generated with [Helicone Temporal Integration](https://github.com/Helicone/helicone)*`;

  return body;
}
