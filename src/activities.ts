import { Octokit } from '@octokit/rest';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import * as dotenv from 'dotenv';
import { query, type SDKMessage } from '@anthropic-ai/claude-code';

const execAsync = promisify(exec);

// Load environment variables
dotenv.config();

// Initialize GitHub client
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

// Activity input/output schemas
const ForkRepositoryInput = z.object({
  owner: z.string(),
  repo: z.string(),
});

const AnalyzeRepositoryInput = z.object({
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
  
  // Fork the repository
  const { data: fork } = await octokit.repos.createFork({
    owner,
    repo,
  });

  // Wait a bit for the fork to be ready
  await new Promise(resolve => setTimeout(resolve, 3000));

  return {
    forkOwner: fork.owner.login,
    forkName: fork.name,
    cloneUrl: fork.clone_url,
    defaultBranch: fork.default_branch,
  };
}

export async function cloneRepository(input: z.infer<typeof AnalyzeRepositoryInput>) {
  const { repoUrl, branch } = input;
  
  // Create temp directory for cloning
  const tempDir = `/tmp/helicone-integration-${Date.now()}`;
  await fs.mkdir(tempDir, { recursive: true });
  
  // Clone the repository
  execSync(`git clone --depth 1 --branch ${branch} ${repoUrl} ${tempDir}`, {
    stdio: 'inherit'
  });

  return { repoPath: tempDir };
}

// Keep the old one for compatibility but simplified
export async function analyzeRepository(input: z.infer<typeof AnalyzeRepositoryInput>) {
  return cloneRepository(input);
}

export async function runClaudeCode(input: z.infer<typeof RunClaudeCodeInput>) {
  const { repoPath, analysis, task } = input;
  
  // Simple and accurate Helicone proxy integration prompt
  const prompt = `<role>You are an expert TypeScript developer integrating Helicone observability into LLM projects.</role>

<task>Add Helicone proxy integration to monitor LLM API calls in this TypeScript project.</task>

<context>
Helicone is a proxy-based observability platform for LLMs. It requires NO new packages - just simple configuration changes to route API calls through Helicone's proxy endpoints. This provides instant monitoring, analytics, and cost tracking.
</context>

<critical_rules>
- MINIMIZE CHANGES: Only modify the absolute minimum required for integration
- NO REFACTORING: Do not clean up, refactor, or reorganize existing code
- PRESERVE FORMATTING: Match the exact indentation and code style of existing files
- MINIMAL DOCUMENTATION: Add only essential information, no extensive sections
- NO EMOJI: Never add emojis to any files
</critical_rules>

<instructions>
1. Find where LLM clients are initialized in the codebase:
   - Look for OpenAI, Anthropic, Azure OpenAI, or other LLM client instantiations
   - Common patterns: "new OpenAI(", "new Anthropic(", "new AzureOpenAI(", etc.

2. Update ONLY the client initialization to use Helicone's proxy:
   - Change/add baseURL to Helicone's proxy endpoint
   - Add Helicone-Auth header with API key
   - Make NO other changes to the initialization

3. Environment variables:
   - If .env.example exists and has HELICONE_API_KEY, do nothing
   - If .env.example exists without HELICONE_API_KEY, add it
   - If no .env.example exists, create minimal one with just HELICONE_API_KEY

4. Only if the project has NO LLM clients at all:
   - Install the minimum required LLM package (e.g., openai)
   - Add minimal working example (10-15 lines max) to demonstrate integration
   - Use existing code structure and patterns

5. README updates (ONLY if it already mentions the LLM provider):
   - Add ONE line mentioning Helicone monitoring is enabled
   - Add link to Helicone dashboard
   - Do NOT add new sections or extensive documentation
</instructions>

<examples>
Here's how to modify existing LLM clients for Helicone (MINIMAL CHANGES ONLY):

**OpenAI - Change from:**
\`\`\`typescript
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
\`\`\`

**To (add only 2 properties):**
\`\`\`typescript
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://oai.helicone.ai/v1",
  defaultHeaders: {
    "Helicone-Auth": \`Bearer \${process.env.HELICONE_API_KEY}\`
  }
});
\`\`\`

**Anthropic - Change from:**
\`\`\`typescript
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
\`\`\`

**To:**
\`\`\`typescript
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: "https://anthropic.helicone.ai",
  defaultHeaders: {
    "Helicone-Auth": \`Bearer \${process.env.HELICONE_API_KEY}\`,
  },
});
\`\`\`

**Azure OpenAI - Change from:**
\`\`\`typescript
const client = new AzureOpenAI({
  apiKey: process.env.AZURE_API_KEY,
  apiVersion: "2024-02-01",
  endpoint: \`https://\${resourceName}.openai.azure.com\`,
});
\`\`\`

**To:**
\`\`\`typescript
const client = new AzureOpenAI({
  apiKey: process.env.AZURE_API_KEY,
  apiVersion: "2024-02-01",
  baseURL: \`https://oai.helicone.ai/openai/deployments/\${deploymentName}\`,
  defaultHeaders: {
    "Helicone-Auth": \`Bearer \${process.env.HELICONE_API_KEY}\`,
    "Helicone-OpenAI-API-Base": \`https://\${resourceName}.openai.azure.com\`,
    "api-key": process.env.AZURE_API_KEY,
  },
});
\`\`\`
</examples>

<documentation>
Helicone Proxy Endpoints:
- OpenAI: https://oai.helicone.ai/v1
- Anthropic: https://anthropic.helicone.ai
- Azure: https://oai.helicone.ai/openai/deployments/[deployment-name]

Full docs: https://docs.helicone.ai/getting-started/quick-start
</documentation>

Remember: 
- Make MINIMAL changes - only what's absolutely necessary
- Do NOT refactor or reorganize existing code
- Match existing code style exactly
- No emojis, no extensive documentation
- If the project already works, don't break it!`;

  try {
    console.log('Running Claude Code SDK in:', repoPath);
    console.log('With ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'Set' : 'Not set');
    
    const messages: SDKMessage[] = [];
    let summary = '';
    
    // Use the Claude Code SDK with permissions
    for await (const message of query({
      prompt,
      options: {
        cwd: repoPath,
        maxTurns: 20, // Allow more turns for complex integration
        allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'LS'], // Grant necessary permissions
      }
    })) {
      // Log each message from Claude Code based on type
      if (message.type === 'assistant' && 'message' in message) {
        console.log('[Claude]:', message.message);
        summary += message.message + '\n';
      } else if (message.type === 'user' && 'message' in message) {
        console.log('[User]:', message.message);
      } else if (message.type === 'system' && 'message' in message) {
        console.log('[System]:', message.message);
      } else if (message.type === 'result') {
        console.log('[Result]:', message);
      }
      
      messages.push(message);
    }

    console.log('Claude Code SDK completed successfully');
    
    const result = { 
      summary: summary || 'Successfully added Helicone integration to the project',
      messages: messages.length
    };
    
    // Extract file changes from Claude Code output
    // Note: We'll need to parse the actual format Claude Code returns
    const modifiedFiles: string[] = [];
    const addedFiles: string[] = [];
    
    // Get list of changed files using git
    const { stdout: gitStatus } = await execAsync('git status --porcelain', { cwd: repoPath });
    const changes = gitStatus.split('\n').filter(line => line.trim());
    
    for (const change of changes) {
      const [status, file] = change.trim().split(/\s+/);
      if (status === 'M') modifiedFiles.push(file);
      if (status === 'A' || status === '??') addedFiles.push(file);
    }

    return {
      success: true,
      changes: {
        modifiedFiles,
        addedFiles,
      },
      summary: 'Successfully integrated Helicone observability into the project',
      changesSummary: result.summary || 'Helicone integration completed',
    };
  } catch (error) {
    console.error('Error running Claude Code:', error);
    throw new Error(`Claude Code execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function createStagingBranch(input: z.infer<typeof CreateStagingBranchInput>) {
  const { repoPath, changes, branchName } = input;
  
  // Create and checkout new branch
  execSync(`cd ${repoPath} && git checkout -b ${branchName}`, {
    stdio: 'inherit'
  });

  // Stage and commit changes
  execSync(`cd ${repoPath} && git add -A && git commit -m "Add Helicone integration"`, {
    stdio: 'inherit'
  });

  // Push to remote
  execSync(`cd ${repoPath} && git push origin ${branchName}`, {
    stdio: 'inherit'
  });

  // Get the compare URL
  const remoteUrl = execSync(`cd ${repoPath} && git remote get-url origin`, {
    encoding: 'utf-8'
  }).trim();
  
  const [, owner, repo] = remoteUrl.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/) || [];
  const compareUrl = `https://github.com/${owner}/${repo}/compare/main...${branchName}`;

  return {
    branchName,
    compareUrl,
  };
}

export async function createPullRequest(input: z.infer<typeof CreatePullRequestInput>) {
  const { owner, repo, head, title, body } = input;
  
  const { data: pr } = await octokit.pulls.create({
    owner,
    repo,
    head,
    base: 'main',
    title,
    body,
  });

  return {
    number: pr.number,
    url: pr.html_url,
    state: pr.state,
  };
}

export async function updateIntegrationStatus(input: z.infer<typeof UpdateIntegrationStatusInput>) {
  // In production, this would update a database or send to a queue
  // For now, we'll just log the status
  console.log('Integration Status Update:', input);
  
  // You could also send this to Helicone's API or database
  // await heliconeAPI.updateIntegration(input.integrationId, {
  //   status: input.status,
  //   message: input.message,
  //   ...
  // });
}

// Helper functions
async function detectLanguage(repoPath: string): Promise<string> {
  const files = await fs.readdir(repoPath);
  
  if (files.includes('package.json')) return 'JavaScript/TypeScript';
  if (files.includes('requirements.txt') || files.includes('setup.py')) return 'Python';
  if (files.includes('go.mod')) return 'Go';
  if (files.includes('Cargo.toml')) return 'Rust';
  if (files.includes('pom.xml') || files.includes('build.gradle')) return 'Java';
  
  return 'Unknown';
}

async function detectLLMProviders(repoPath: string): Promise<string[]> {
  const providers: string[] = [];
  
  // Search for common LLM provider patterns in the codebase
  // This is simplified - in production would be more sophisticated
  const searchPatterns = {
    'OpenAI': ['openai', 'gpt-', 'text-davinci'],
    'Anthropic': ['anthropic', 'claude'],
    'Google': ['vertex', 'palm', 'gemini'],
    'Cohere': ['cohere'],
    'HuggingFace': ['huggingface', 'transformers'],
  };

  // Would implement actual file searching here
  // For now, return a mock result
  return ['OpenAI'];
}

async function detectPackageManager(repoPath: string): Promise<string> {
  const files = await fs.readdir(repoPath);
  
  if (files.includes('package-lock.json')) return 'npm';
  if (files.includes('yarn.lock')) return 'yarn';
  if (files.includes('pnpm-lock.yaml')) return 'pnpm';
  if (files.includes('requirements.txt')) return 'pip';
  if (files.includes('go.mod')) return 'go';
  
  return 'unknown';
}

async function checkForTests(repoPath: string): Promise<boolean> {
  const testDirs = ['test', 'tests', '__tests__', 'spec'];
  const files = await fs.readdir(repoPath);
  
  return testDirs.some(dir => files.includes(dir));
}

async function findEntryPoints(repoPath: string): Promise<string[]> {
  const commonEntryPoints = [
    'index.js', 'index.ts', 'main.js', 'main.ts',
    'app.js', 'app.ts', 'server.js', 'server.ts',
    'index.py', 'main.py', 'app.py',
  ];
  
  const files = await fs.readdir(repoPath);
  return commonEntryPoints.filter(entry => files.includes(entry));
}