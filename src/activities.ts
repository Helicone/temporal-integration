import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import { z } from 'zod';
import * as dotenv from 'dotenv';
import { query, type SDKMessage } from '@anthropic-ai/claude-code';
import { HELICONE_INTEGRATION_PROMPT } from './constants';
import { getErrorMessage, GitOperationError, ClaudeCodeError, GitHubAPIError } from './utils/errors';

const execAsync = promisify(exec);

// Load environment variables
dotenv.config();

// Initialize GitHub client
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

// Activity input schemas
const ForkRepositoryInput = z.object({
  owner: z.string(),
  repo: z.string(),
});

const CloneRepositoryInput = z.object({
  repoUrl: z.string(),
  branch: z.string(),
});

const RunClaudeCodeInput = z.object({
  repoPath: z.string(),
  analysis: z.any(),
  task: z.string(),
});

const CreateStagingBranchInput = z.object({
  repoPath: z.string(),
  changes: z.any(),
  branchName: z.string(),
});

const CreatePullRequestInput = z.object({
  owner: z.string(),
  repo: z.string(),
  head: z.string(),
  base: z.string().optional(),
  title: z.string(),
  body: z.string(),
});

const UpdateIntegrationStatusInput = z.object({
  integrationId: z.string(),
  status: z.string(),
  message: z.string(),
  stagingUrl: z.string().optional(),
  prUrl: z.string().optional(),
});

// Activity implementations
export async function forkRepository(input: z.infer<typeof ForkRepositoryInput>) {
  const { owner, repo } = input;

  try {
    const { data: fork } = await octokit.repos.createFork({
      owner,
      repo,
    });

    // Wait a bit for the fork to be ready
    await new Promise((resolve) => setTimeout(resolve, 3000));

    return {
      forkOwner: fork.owner.login,
      forkName: fork.name,
      cloneUrl: fork.clone_url,
      defaultBranch: fork.default_branch,
    };
  } catch (error) {
    throw new GitHubAPIError(`Failed to fork repository: ${getErrorMessage(error)}`, error as Error);
  }
}

export async function cloneRepository(input: z.infer<typeof CloneRepositoryInput>) {
  const { repoUrl, branch } = input;

  // Create temp directory for cloning
  const tempDir = `/tmp/helicone-integration-${Date.now()}`;
  
  try {
    await fs.mkdir(tempDir, { recursive: true });

    // Clone the repository
    execSync(`git clone --depth 1 --branch ${branch} ${repoUrl} ${tempDir}`, {
      stdio: 'inherit',
    });

    return { repoPath: tempDir };
  } catch (error) {
    throw new GitOperationError(`Failed to clone repository: ${getErrorMessage(error)}`, error as Error);
  }
}

export async function runClaudeCode(
  input: z.infer<typeof RunClaudeCodeInput>
) {
  const { repoPath } = input;

  try {
    console.log('Running Claude Code SDK in:', repoPath);
    console.log('With ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'Set' : 'Not set');

    const messages: SDKMessage[] = [];
    let summary = '';

    // Use the Claude Code SDK for initial integration
    for await (const message of query({
      prompt: HELICONE_INTEGRATION_PROMPT,
      options: {
        cwd: repoPath,
        maxTurns: 20,
        allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'LS'],
        pathToClaudeCodeExecutable: require.resolve('@anthropic-ai/claude-code/cli.js'),
      },
    })) {
      // Log messages based on type
      if (message.type === 'assistant' && 'message' in message) {
        // Extract only text content from assistant messages
        if (typeof message.message === 'string') {
          console.log('[Claude]:', message.message);
          summary += message.message + '\n';
        } else if (message.message && typeof message.message === 'object' && 'content' in message.message) {
          // Handle structured messages with content array
          const msg = message.message as any;
          if (Array.isArray(msg.content)) {
            for (const content of msg.content) {
              if (content.type === 'text' && content.text) {
                console.log('[Claude]:', content.text);
                summary += content.text + '\n';
              }
            }
          }
        }
      } else if (message.type === 'result' && 'session_id' in message) {
        // Capture session ID from result
        messages.push(message);
      }
    }

    console.log('Claude Code SDK completed successfully');

    // Extract session ID from result message
    const resultMessage = messages.find((m) => m.type === 'result' && 'session_id' in m) as any;
    const claudeSessionId = resultMessage?.session_id;

    // Get file changes using git
    const { modifiedFiles, addedFiles } = await getGitChanges(repoPath);

    // Create a formatted changes summary
    const changesSummary = formatChangesSummary(modifiedFiles, addedFiles);

    // Try to extract commit message if Claude Code made one
    let suggestedPRTitle = 'Add Helicone observability integration';
    try {
      // First check if there are uncommitted changes
      const { stdout: statusCheck } = await execAsync('git status --porcelain', { cwd: repoPath });
      
      if (!statusCheck.trim()) {
        // No uncommitted changes, so Claude Code must have committed
        const { stdout: lastCommit } = await execAsync('git log -1 --pretty=format:%s', { cwd: repoPath });
        if (lastCommit) {
          console.log('Found Claude Code commit:', lastCommit);
          suggestedPRTitle = lastCommit.trim();
        }
      } else {
        console.log('Claude Code did not commit changes');
      }
    } catch (e) {
      console.log('Error checking for commit:', e);
      // Couldn't get commit message, use default
    }

    return {
      success: true,
      changes: {
        modifiedFiles,
        addedFiles,
      },
      summary: summary.trim() || 'Successfully integrated Helicone observability into the project',
      changesSummary,
      sessionId: claudeSessionId,
      suggestedPRTitle,
    };
  } catch (error) {
    console.error('Error running Claude Code:', error);
    throw new ClaudeCodeError(`Claude Code execution failed: ${getErrorMessage(error)}`, error as Error);
  }
}

// New activity specifically for applying feedback
export async function applyClaudeCodeFeedback(
  input: { repoPath: string; sessionId: string; feedback: string; branchName: string }
) {
  const { repoPath, sessionId, feedback, branchName } = input;

  try {
    console.log('Applying feedback with Claude Code');
    console.log('Session ID:', sessionId);
    console.log('Feedback:', feedback);
    console.log('Branch:', branchName);

    // First, ensure we're on the right branch
    execSync(`cd ${repoPath} && git checkout ${branchName}`, {
      stdio: 'inherit',
    });

    const messages: SDKMessage[] = [];
    let summary = '';

    // Resume the session with feedback
    for await (const message of query({
      prompt: `The previous integration attempt was rejected with this feedback: "${feedback}"\n\nPlease address this feedback and make the necessary adjustments.`,
      options: {
        cwd: repoPath,
        maxTurns: 20,
        allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'LS'],
        pathToClaudeCodeExecutable: require.resolve('@anthropic-ai/claude-code/cli.js'),
        resume: sessionId,
      },
    })) {
      if (message.type === 'assistant' && 'message' in message) {
        // Extract only text content from assistant messages
        if (typeof message.message === 'string') {
          console.log('[Claude]:', message.message);
          summary += message.message + '\n';
        } else if (message.message && typeof message.message === 'object' && 'content' in message.message) {
          // Handle structured messages with content array
          const msg = message.message as any;
          if (Array.isArray(msg.content)) {
            for (const content of msg.content) {
              if (content.type === 'text' && content.text) {
                console.log('[Claude]:', content.text);
                summary += content.text + '\n';
              }
            }
          }
        }
      }
    }

    // Check for changes
    const { stdout: gitStatus } = await execAsync('git status --porcelain', { cwd: repoPath });
    if (!gitStatus.trim()) {
      console.log('No changes made after applying feedback');
      return {
        success: false,
        summary: 'No changes were made in response to the feedback',
      };
    }

    // Stage and commit the changes
    execSync(`cd ${repoPath} && git add -A`, { stdio: 'inherit' });
    execSync(`cd ${repoPath} && git commit -m "Apply review feedback: ${feedback.substring(0, 50)}..." --no-verify`, {
      stdio: 'inherit',
    });

    // Push to update the existing PR
    execSync(`cd ${repoPath} && git push origin ${branchName}`, {
      stdio: 'inherit',
    });

    // Get file changes
    const { modifiedFiles, addedFiles } = await getGitChanges(repoPath);
    const changesSummary = formatChangesSummary(modifiedFiles, addedFiles);

    return {
      success: true,
      summary: summary.trim() || 'Successfully applied feedback',
      changesSummary,
    };
  } catch (error) {
    console.error('Error applying feedback:', error);
    throw new ClaudeCodeError(`Failed to apply feedback: ${getErrorMessage(error)}`, error as Error);
  }
}

async function getGitChanges(repoPath: string): Promise<{ modifiedFiles: string[]; addedFiles: string[] }> {
  const { stdout: gitStatus } = await execAsync('git status --porcelain', { cwd: repoPath });
  const changes = gitStatus.split('\n').filter((line) => line.trim());

  const modifiedFiles: string[] = [];
  const addedFiles: string[] = [];

  for (const change of changes) {
    const [status, ...fileParts] = change.trim().split(/\s+/);
    const file = fileParts.join(' ');
    
    if (status === 'M') modifiedFiles.push(file);
    if (status === 'A' || status === '??') addedFiles.push(file);
  }

  return { modifiedFiles, addedFiles };
}

function formatChangesSummary(modifiedFiles: string[], addedFiles: string[]): string {
  let summary = '';
  
  if (modifiedFiles.length > 0) {
    summary += `### Modified Files:\n${modifiedFiles.map((f) => `- ${f}`).join('\n')}\n\n`;
  }
  
  if (addedFiles.length > 0) {
    summary += `### Added Files:\n${addedFiles.map((f) => `- ${f}`).join('\n')}\n\n`;
  }
  
  if (!summary) {
    summary = 'No file changes detected.';
  }
  
  return summary;
}

export async function createStagingBranch(input: z.infer<typeof CreateStagingBranchInput>) {
  const { repoPath, branchName } = input;

  try {
    // Ensure we're on the default branch
    execSync(`cd ${repoPath} && git checkout main || git checkout master`, {
      stdio: 'inherit',
    });

    // Check if Claude Code already made a commit
    const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: repoPath });
    console.log('Git status:', statusOutput || 'No uncommitted changes');

    let hasCommit = false;
    
    if (!statusOutput.trim()) {
      // No uncommitted changes - check if Claude made a commit
      try {
        const { stdout: lastCommit } = await execAsync('git log -1 --pretty=format:%s', { cwd: repoPath });
        if (lastCommit && lastCommit.toLowerCase().includes('helicone')) {
          console.log('Claude Code already created commit:', lastCommit);
          hasCommit = true;
        }
      } catch (e) {
        // No commits yet
      }
    }

    if (!hasCommit && !statusOutput.trim()) {
      throw new GitOperationError('No changes to commit');
    }

    // Create and checkout new branch
    execSync(`cd ${repoPath} && git checkout -b ${branchName}`, {
      stdio: 'inherit',
    });

    // Only commit if Claude Code didn't already
    if (!hasCommit && statusOutput.trim()) {
      // Stage all changes
      execSync(`cd ${repoPath} && git add -A`, {
        stdio: 'inherit',
      });
      
      // Claude Code didn't commit, so we'll do a basic one
      execSync(`cd ${repoPath} && git commit -m "Add Helicone integration" --no-verify`, {
        stdio: 'inherit',
      });
    }

    // Push to remote
    execSync(`cd ${repoPath} && git push origin ${branchName}`, {
      stdio: 'inherit',
    });
  } catch (error) {
    console.error('Git operation failed:', error);
    throw new GitOperationError(`Failed to create staging branch: ${getErrorMessage(error)}`, error as Error);
  }

  // Get the compare URL
  const remoteUrl = execSync(`cd ${repoPath} && git remote get-url origin`, {
    encoding: 'utf-8',
  }).trim();

  const [, owner, repo] = remoteUrl.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/) || [];
  const compareUrl = `https://github.com/${owner}/${repo}/compare/main...${branchName}`;

  return {
    branchName,
    compareUrl,
  };
}

export async function createPullRequest(input: z.infer<typeof CreatePullRequestInput>) {
  const { owner, repo, head, base, title, body } = input;

  try {
    const { data: pr } = await octokit.pulls.create({
      owner,
      repo,
      head,
      base: base || 'main',
      title,
      body,
    });

    return {
      number: pr.number,
      url: pr.html_url,
      state: pr.state,
    };
  } catch (error) {
    throw new GitHubAPIError(`Failed to create pull request: ${getErrorMessage(error)}`, error as Error);
  }
}

export async function updateIntegrationStatus(input: z.infer<typeof UpdateIntegrationStatusInput>) {
  // Log the status update
  console.log('Integration Status Update:', {
    id: input.integrationId,
    status: input.status,
    message: input.message,
    ...(input.stagingUrl && { stagingUrl: input.stagingUrl }),
    ...(input.prUrl && { prUrl: input.prUrl }),
  });

  // In production, this would update a database or send to a queue
  // For example:
  // await heliconeAPI.updateIntegration(input.integrationId, {
  //   status: input.status,
  //   message: input.message,
  //   stagingUrl: input.stagingUrl,
  //   prUrl: input.prUrl,
  // });
}