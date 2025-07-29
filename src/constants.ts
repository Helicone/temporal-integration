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