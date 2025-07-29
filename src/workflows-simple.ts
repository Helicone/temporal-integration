import { proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities';

const { forkRepository } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
});

export interface SimpleForkInput {
  owner: string;
  repo: string;
}

export async function simpleForkWorkflow(input: SimpleForkInput): Promise<string> {
  console.log(`Starting fork workflow for ${input.owner}/${input.repo}`);
  
  const result = await forkRepository({
    owner: input.owner,
    repo: input.repo
  });
  
  return `Successfully forked! New repo: ${result.forkOwner}/${result.forkName}`;
}