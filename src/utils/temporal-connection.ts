import { Connection } from "@temporalio/client";
import { NativeConnection } from "@temporalio/worker";
import * as fs from "fs/promises";

export interface TemporalConfig {
  address?: string;
  namespace?: string;
  tlsCertPath?: string;
  tlsKeyPath?: string;
  tlsCaPath?: string;
}

/**
 * Determines if we're in a production environment
 */
function isProduction(): boolean {
  const nodeEnv = process.env.NODE_ENV || "development";
  return ["production", "staging"].includes(nodeEnv);
}

/**
 * Gets Temporal configuration from environment variables
 */
function getConfigFromEnv(): TemporalConfig {
  return {
    address: process.env.TEMPORAL_ADDRESS,
    namespace: process.env.TEMPORAL_NAMESPACE || "default",
    tlsCertPath: process.env.TEMPORAL_TLS_CERT_PATH,
    tlsKeyPath: process.env.TEMPORAL_TLS_KEY_PATH,
    tlsCaPath: process.env.TEMPORAL_TLS_CA_PATH,
  };
}

/**
 * Creates a connection for Temporal Client (used for starting workflows, queries, etc.)
 */
export async function createClientConnection(
  config?: TemporalConfig
): Promise<Connection> {
  const cfg = { ...getConfigFromEnv(), ...config };

  if (isProduction()) {
    console.log("Connecting to Temporal Cloud...");

    // Validate required configuration
    if (!cfg.address) {
      throw new Error(
        "TEMPORAL_ADDRESS must be set for Temporal Cloud (e.g., namespace.tmprl.cloud:7233)"
      );
    }

    // Check if we have API key authentication
    const hasApiKey = process.env.TEMPORAL_API_KEY;

    if (hasApiKey) {
      console.log("Using API key authentication");
      return Connection.connect({
        address: cfg.address,
        apiKey: process.env.TEMPORAL_API_KEY,
        tls: true, // API key authentication still requires TLS
      });
    }

    // Otherwise check for certificate authentication
    const hasFilePaths = cfg.tlsCertPath && cfg.tlsKeyPath;
    const hasBase64 =
      process.env.TEMPORAL_TLS_CERT_B64 && process.env.TEMPORAL_TLS_KEY_B64;

    if (!hasFilePaths && !hasBase64) {
      throw new Error(
        "Either TEMPORAL_API_KEY or certificate authentication (TEMPORAL_TLS_CERT_PATH/TEMPORAL_TLS_KEY_PATH or TEMPORAL_TLS_CERT_B64/TEMPORAL_TLS_KEY_B64) must be set for Temporal Cloud"
      );
    }

    // Load certificates - check for base64 env vars first (for Fly.io)
    let cert: Buffer;
    let key: Buffer;

    if (process.env.TEMPORAL_TLS_CERT_B64 && process.env.TEMPORAL_TLS_KEY_B64) {
      // Decode from base64 (Fly.io deployment)
      cert = Buffer.from(process.env.TEMPORAL_TLS_CERT_B64, "base64");
      key = Buffer.from(process.env.TEMPORAL_TLS_KEY_B64, "base64");
    } else if (cfg.tlsCertPath && cfg.tlsKeyPath) {
      // Load from files (local/traditional deployment)
      [cert, key] = await Promise.all([
        fs.readFile(cfg.tlsCertPath),
        fs.readFile(cfg.tlsKeyPath),
      ]);
    } else {
      throw new Error("No valid TLS credentials found");
    }

    // Optional: Load CA certificate if using custom CA
    let ca;
    if (process.env.TEMPORAL_TLS_CA_B64) {
      ca = Buffer.from(process.env.TEMPORAL_TLS_CA_B64, "base64");
    } else if (cfg.tlsCaPath) {
      ca = await fs.readFile(cfg.tlsCaPath);
    }

    const connectionOptions: any = {
      address: cfg.address,
      tls: {
        clientCertPair: {
          crt: cert,
          key: key,
        },
      },
    };

    // Add CA if provided
    if (ca) {
      connectionOptions.tls.ca = ca;
    }

    return Connection.connect(connectionOptions);
  } else {
    console.log("Connecting to local Temporal...");
    const address = cfg.address || "localhost:7233";
    return Connection.connect({ address });
  }
}

/**
 * Creates a connection for Temporal Worker (processes workflows and activities)
 */
export async function createWorkerConnection(
  config?: TemporalConfig
): Promise<NativeConnection> {
  const cfg = { ...getConfigFromEnv(), ...config };

  if (isProduction()) {
    console.log("Worker connecting to Temporal Cloud...");

    // Validate required configuration
    if (!cfg.address) {
      throw new Error(
        "TEMPORAL_ADDRESS must be set for Temporal Cloud (e.g., namespace.tmprl.cloud:7233)"
      );
    }

    // Check if we have API key authentication
    const hasApiKey = process.env.TEMPORAL_API_KEY;

    if (hasApiKey) {
      console.log("Using API key authentication");
      return NativeConnection.connect({
        address: cfg.address,
        apiKey: process.env.TEMPORAL_API_KEY,
        tls: true, // API key authentication still requires TLS
      });
    }

    // Otherwise check for certificate authentication
    const hasFilePaths = cfg.tlsCertPath && cfg.tlsKeyPath;
    const hasBase64 =
      process.env.TEMPORAL_TLS_CERT_B64 && process.env.TEMPORAL_TLS_KEY_B64;

    if (!hasFilePaths && !hasBase64) {
      throw new Error(
        "Either TEMPORAL_API_KEY or certificate authentication (TEMPORAL_TLS_CERT_PATH/TEMPORAL_TLS_KEY_PATH or TEMPORAL_TLS_CERT_B64/TEMPORAL_TLS_KEY_B64) must be set for Temporal Cloud"
      );
    }

    // Load certificates - check for base64 env vars first (for Fly.io)
    let cert: Buffer;
    let key: Buffer;

    if (process.env.TEMPORAL_TLS_CERT_B64 && process.env.TEMPORAL_TLS_KEY_B64) {
      // Decode from base64 (Fly.io deployment)
      cert = Buffer.from(process.env.TEMPORAL_TLS_CERT_B64, "base64");
      key = Buffer.from(process.env.TEMPORAL_TLS_KEY_B64, "base64");
    } else if (cfg.tlsCertPath && cfg.tlsKeyPath) {
      // Load from files (local/traditional deployment)
      [cert, key] = await Promise.all([
        fs.readFile(cfg.tlsCertPath),
        fs.readFile(cfg.tlsKeyPath),
      ]);
    } else {
      throw new Error("No valid TLS credentials found");
    }

    // Optional: Load CA certificate if using custom CA
    let ca;
    if (process.env.TEMPORAL_TLS_CA_B64) {
      ca = Buffer.from(process.env.TEMPORAL_TLS_CA_B64, "base64");
    } else if (cfg.tlsCaPath) {
      ca = await fs.readFile(cfg.tlsCaPath);
    }

    const connectionOptions: any = {
      address: cfg.address,
      tls: {
        clientCertPair: {
          crt: cert,
          key: key,
        },
      },
    };

    // Add CA if provided
    if (ca) {
      connectionOptions.tls.ca = ca;
    }

    return NativeConnection.connect(connectionOptions);
  } else {
    console.log("Worker connecting to local Temporal...");
    const address = cfg.address || "localhost:7233";
    return NativeConnection.connect({ address });
  }
}

/**
 * Gets the configured namespace
 */
export function getNamespace(config?: TemporalConfig): string {
  const cfg = { ...getConfigFromEnv(), ...config };
  return cfg.namespace || "default";
}
