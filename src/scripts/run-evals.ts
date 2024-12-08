#!/usr/bin/env bun
import { resolve } from 'path';
import runEvals from '../evals/EvaluationRunner';
import config from '../config/config';

console.log('Current directory:', process.cwd());
console.log('Script path:', resolve(__dirname, 'run-evals.ts'));

// Debug MCP configuration
console.log('MCP Server Command:', config.MCP_SERVER_COMMAND);
console.log('MCP Server Args:', config.MCP_SERVER_ARGS);

async function main() {
  try {
    await runEvals();
  } catch (error) {
    console.error('Evaluation failed:', error);
    process.exit(1);
  }
}

main();
