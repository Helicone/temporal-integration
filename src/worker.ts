import { Worker } from '@temporalio/worker';
import * as activities from './activities';
import * as dotenv from 'dotenv';
import { createWorkerConnection, getNamespace } from './utils/temporal-connection';

// Load environment variables
dotenv.config();

async function run() {
  const connection = await createWorkerConnection();
  const namespace = getNamespace();
  
  try {
    const worker = await Worker.create({
      connection,
      namespace,
      taskQueue: 'helicone-integration',
      workflowsPath: require.resolve('./workflows'),
      activities,
    });

    console.log(`Worker starting in namespace: ${namespace}`);
    await worker.run();
  } finally {
    await connection.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
