# Helicone Temporal Integration

Automated system for integrating Helicone observability into open-source LLM projects using Temporal workflows and Claude Code.

## Overview

This service automates the process of:
1. Identifying suitable open-source repositories using LLMs
2. Forking and analyzing the codebase
3. Using Claude Code to generate Helicone integration code
4. Creating staging branches for review
5. Submitting pull requests after approval

## Architecture

- **Temporal Workflows**: Orchestrates the multi-step integration process
- **Claude Code**: Generates the actual integration code
- **GitHub API**: Manages forks, branches, and pull requests
- **Review Dashboard**: Human-in-the-loop approval system

## Setup

### Prerequisites

- Node.js 20+
- GitHub Personal Access Token
- Anthropic API Key (for Claude Code)
- Temporal Cloud account (or local Temporal server for development)

### Environment Variables

Create a `.env` file with:

```bash
# API Keys
GITHUB_TOKEN=your_github_token
ANTHROPIC_API_KEY=your_anthropic_api_key

# Temporal Configuration
NODE_ENV=production  # or development for local
TEMPORAL_ADDRESS=region.provider.api.temporal.io:7233  # for cloud
TEMPORAL_NAMESPACE=your-namespace
TEMPORAL_API_KEY=your_temporal_api_key  # for cloud authentication
```

### Local Development

1. Install dependencies:
```bash
npm install
```

2. For local Temporal development:
```bash
# Install Temporal CLI
brew install temporal  # or download from https://temporal.io/downloads

# Start local Temporal server
temporal server start-dev

# Build and start worker
npm run build
npm run start:dev
```

3. Run a workflow:
```bash
npm run workflow:dev -- <repository-url>
```

### Production Deployment (Fly.io)

The worker is deployed on Fly.io and connects to Temporal Cloud:

```bash
# Deploy to Fly.io
fly deploy

# Set secrets
fly secrets set GITHUB_TOKEN=xxx
fly secrets set ANTHROPIC_API_KEY=xxx
fly secrets set TEMPORAL_API_KEY=xxx
# ... other secrets
```

## Usage

### Starting an Integration Workflow

There are three ways to start a workflow:

#### 1. From Temporal Cloud UI

Navigate to your Temporal Cloud namespace and use the UI to start a workflow:

- **Workflow Type**: `repositoryIntegrationWorkflow`
- **Task Queue**: `helicone-integration`
- **Workflow ID**: `integration-<unique-id>` (or leave blank for auto-generated)
- **Input** (must be wrapped in an array):
```json
[
  {
    "repoUrl": "https://github.com/owner/repo",
    "repoOwner": "owner",
    "repoName": "repo",
    "integrationId": "unique-id-123"
  }
]
```
- **Encoding**: `json/plain`

#### 2. From Command Line (Local)

```bash
# Set environment variables for Temporal Cloud connection
export NODE_ENV=production
export TEMPORAL_ADDRESS="your-namespace.tmprl.cloud:7233"
export TEMPORAL_NAMESPACE="your-namespace"
export TEMPORAL_API_KEY="your-api-key"

# Run the client
npm run workflow -- https://github.com/owner/repo
```

#### 3. From Development Environment

```bash
# For local Temporal server
npm run workflow:dev -- https://github.com/owner/repo
```

### Reviewing Integration Results

```bash
npm run review
# or
npm run review:dev
```

Follow the prompts to approve or reject the integration.

## Project Structure

- `src/workflows.ts` - Temporal workflow definitions
- `src/activities.ts` - Temporal activities (GitHub, Claude Code integration)
- `src/worker.ts` - Temporal worker that processes workflows
- `src/client.ts` - CLI for starting workflows
- `src/review.ts` - CLI for reviewing integration results
- `src/utils/temporal-connection.ts` - Temporal Cloud/local connection handling

## Key Features

- **Automated Integration**: Uses Claude Code to analyze codebases and generate Helicone integration
- **Human Review**: All integrations go through staging review before PR submission
- **Temporal Orchestration**: Reliable, resumable workflows with built-in retry logic
- **Cloud Deployment**: Production worker runs on Fly.io, connected to Temporal Cloud