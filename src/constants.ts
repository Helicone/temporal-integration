export const HELICONE_INTEGRATION_PROMPT = `<role>You are an expert TypeScript developer integrating Helicone observability into LLM projects.</role>

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
1. First, check for contribution guidelines:
   - Look for CONTRIBUTING.md, .github/CONTRIBUTING.md, or similar files
   - Check README for contribution section
   - Look for .github/pull_request_template.md
   - Identify any specific requirements for:
     * Commit message format (e.g., conventional commits)
     * Branch naming conventions
     * Code style requirements
     * Testing requirements
     * Documentation requirements

2. Find where LLM clients are initialized in the codebase:
   - Look for OpenAI, Anthropic, Azure OpenAI, or other LLM client instantiations
   - Common patterns: "new OpenAI(", "new Anthropic(", "new AzureOpenAI(", etc.

3. Update ONLY the client initialization to use Helicone's proxy:
   - Change/add baseURL to Helicone's proxy endpoint
   - Add Helicone-Auth header with API key
   - Make NO other changes to the initialization
   - Follow the project's code style EXACTLY (spacing, quotes, semicolons, etc.)

4. Environment variables:
   - Check how the project handles env variables (e.g., .env, config files, etc.)
   - Follow their existing pattern for adding new environment variables
   - If .env.example exists and has HELICONE_API_KEY, do nothing
   - If .env.example exists without HELICONE_API_KEY, add it following their format
   - If no .env.example exists, check if they use another pattern before creating one

5. Testing:
   - If the project has tests for the LLM integration, update them to work with Helicone
   - Don't break existing tests
   - If they require tests for new features, add minimal tests for the Helicone integration

6. Commit and PR preparation:
   - Study recent commits with git log to understand their commit message format
   - Follow their exact commit message style (conventional commits, length, format)
   - IMPORTANT: Create a git commit with your changes following their conventions
   - Your commit message should blend in perfectly with their commit history
   - Examples of good commit messages based on project style:
     * Conventional: "feat: add Helicone observability integration"
     * Angular: "feat(monitoring): integrate Helicone for LLM observability"
     * Simple: "Add Helicone integration for LLM monitoring"
   - Branch naming: check existing branches to follow their pattern
   - If they have specific PR requirements, prepare notes about how this PR meets them

CRITICAL: Your PR will be rejected if you don't follow their contribution guidelines!
Before making ANY changes:
1. Search for and read: CONTRIBUTING.md, CODE_OF_CONDUCT.md, .github/CONTRIBUTING.md
2. Look for PR templates in .github/pull_request_template.md
3. Check recent merged PRs to see what gets accepted
4. Run their linter/formatter if they have one (npm run lint, cargo fmt, etc.)
5. Study their code style - match it EXACTLY
6. If they require signing commits or DCO, note that for the human operator

Your changes should look like they were written by a regular contributor to the project.
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

export const DEFAULT_ACTIVITY_TIMEOUT = {
  startToCloseTimeout: '30 minutes',
  retry: {
    initialInterval: '30s',
    maximumInterval: '5m',
    maximumAttempts: 3,
  },
};

export const CLAUDE_CODE_TIMEOUT = {
  startToCloseTimeout: '20 minutes',
  retry: {
    initialInterval: '30s',
    maximumInterval: '5m',
    maximumAttempts: 2,
  },
};
