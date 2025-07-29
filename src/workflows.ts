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
const { runClaudeCode, applyClaudeCodeFeedback } = proxyActivities<Pick<typeof activities, 'runClaudeCode' | 'applyClaudeCodeFeedback'>>({
  startToCloseTimeout: '20 minutes',
  retry: {
    initialInterval: '30s',
    maximumInterval: '5m',
    maximumAttempts: 2,
  },
});

// Use default timeout for other activities
const { forkRepository, cloneRepository, createStagingBranch, createPullRequest, updateIntegrationStatus } = defaultActivities;

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

  // Set up signal handler for review
  setHandler(reviewChangesSignal, (decision: ReviewDecision) => {
    reviewDecision = decision;
  });

  try {
    // Step 1: Fork and clone repository
    const { repoPath, forkInfo } = await setupRepository(input);

    // Step 2: Integration loop - allows retry with feedback
    const integrationResult = await performIntegration(input, repoPath, forkInfo, () => reviewDecision);
    
    if (!integrationResult) {
      return; // No changes needed or rejected
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
  getReviewDecision: () => ReviewDecision | undefined
): Promise<{ branchName: string; attemptCount: number; claudeSessionId?: string } | null> {
  // Step 1: Initial integration
  const claudeResult = await runClaudeIntegration(input, repoPath);
  
  if (!claudeResult) {
    return null; // No changes needed
  }

  const branchName = `helicone-integration-${input.integrationId}`;
  const sessionId = claudeResult.sessionId;

  // Create staging branch and PR for review
  await createReviewPullRequest(
    input,
    repoPath,
    claudeResult,
    branchName,
    1,
    undefined,
    forkInfo
  );

  // Step 2: Review loop
  let attemptCount = 1;
  let integrationComplete = false;

  while (!integrationComplete && attemptCount < 3) {
    const reviewDecision = await waitForReview(input);
    
    if (!reviewDecision) {
      return null; // Timeout
    }

    if (reviewDecision.approved) {
      integrationComplete = true;
    } else if (!reviewDecision.feedback) {
      await updateIntegrationStatus({
        integrationId: input.integrationId,
        status: 'rejected',
        message: 'Changes rejected without feedback',
      });
      return null;
    } else {
      // Apply feedback to the existing PR
      attemptCount++;
      
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
        await updateIntegrationStatus({
          integrationId: input.integrationId,
          status: 'failed',
          message: 'Failed to apply feedback: ' + feedbackResult.summary,
        });
        return null;
      }

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
    return null;
  }

  return { branchName, attemptCount, claudeSessionId: sessionId };
}

async function runClaudeIntegration(
  input: RepositoryIntegrationInput,
  repoPath: string
) {
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
    (claudeResult.changes.modifiedFiles?.length ?? 0) > 0 ||
    (claudeResult.changes.addedFiles?.length ?? 0) > 0;

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
  forkInfo: ForkResult
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

async function waitForReview(input: RepositoryIntegrationInput): Promise<ReviewDecision | null> {
  let reviewDecision: ReviewDecision | undefined;
  
  // Set up a fresh signal handler for this review
  setHandler(reviewChangesSignal, (decision: ReviewDecision) => {
    reviewDecision = decision;
  });

  // Wait for review signal (max 7 days)
  const received = await condition(() => reviewDecision !== undefined, '7 days');

  if (!received) {
    await updateIntegrationStatus({
      integrationId: input.integrationId,
      status: 'failed',
      message: 'Review timed out after 7 days.',
    });
    return null;
  }

  return reviewDecision!;
}

async function createFinalPullRequest(
  input: RepositoryIntegrationInput,
  forkInfo: ForkResult,
  branchName: string,
  attemptCount: number,
  sessionId?: string
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
    title: 'Add Helicone observability integration',
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

function formatReviewPRBody(
  input: RepositoryIntegrationInput,
  claudeResult: any
): string {
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
  let body = `## Summary

This PR adds Helicone observability to track and monitor LLM usage.

`;

  if (sessionId) {
    body += `Session ID: ${sessionId}

`;
  }

  body += `## Changes

`;

  if (attemptCount > 1) {
    body += `This integration was refined through ${attemptCount} iterations based on review feedback.

`;
  }

  body += `---

*This PR was generated with [Helicone Temporal Integration](https://github.com/Helicone/helicone)*`;

  return body;
}