# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Temporal-based automation system that integrates Helicone observability into open-source LLM projects. It uses:
- Temporal workflows for orchestration
- Claude Code SDK for generating integration code
- GitHub API for repository management

## Development Commands

### Build
```bash
npm run build        # Compile TypeScript
npm run build.watch  # Watch mode
```

### Run
```bash
# Start Temporal (required first)
docker-compose up

# Start worker
npm start
# or watch mode:
npm start.watch

# Execute workflow
npm run workflow
```

### Review Workflows
```bash
# Approve changes
npm run review <workflow-id> approve

# Reject with feedback
npm run review <workflow-id> reject "feedback here"
```

### Code Quality
```bash
npm run lint         # ESLint with TypeScript
npm run format       # Prettier formatting
npm run format:check # Check formatting
```

## Architecture

### Project Structure
- `/src` - TypeScript source files
  - `worker.ts` - Temporal worker that executes workflows and activities
  - `client.ts` - CLI client to start workflows
  - `workflows.ts` - Temporal workflow definitions (simplified with helper functions)
  - `activities.ts` - Temporal activities (GitHub, Claude Code, Git operations)
  - `review.ts` - CLI tool for sending review signals to workflows
  - `constants.ts` - Shared constants including Claude Code prompt
  - `/utils` - Utility functions
    - `errors.ts` - Standardized error handling classes

### Workflow Pattern
The system follows Temporal's workflow/activity separation:
- **Workflows** (`src/workflows.ts`): Orchestration logic, must be deterministic
- **Activities** (`src/activities.ts`): Side effects like API calls, file I/O
- **Worker** (`src/worker.ts`): Executes workflows and activities
- **Client** (`src/client.ts`): Starts workflows

### Key Integration Flow
1. `repositoryIntegrationWorkflow` orchestrates the entire process
2. Fork repository and clone it locally
3. Run Claude Code to add Helicone integration (with retry/feedback loop)
4. Create review PR in fork for human approval
5. Upon approval, create final PR to original repository
6. Activities handle GitHub operations, file system operations, and Claude Code execution
7. Claude Code SDK is used with specific permissions to modify codebases

### Error Handling
- Custom error types in `utils/errors.ts` for different failure scenarios
- Consistent error messages across activities
- Proper cleanup and status updates on failure

### Important Constraints
- Workflow code cannot import Node.js built-ins (except 'assert')
- Activities have timeout and retry configurations
- Claude Code execution has extended timeout (20 minutes)

## Environment Variables
Required in `.env`:
- `GITHUB_TOKEN`: GitHub PAT with repo permissions
- `ANTHROPIC_API_KEY`: For Claude Code SDK
- `TEMPORAL_ADDRESS`: Default localhost:7233
- `HELICONE_API_URL`: For status updates
- `HELICONE_API_KEY`: For API authentication