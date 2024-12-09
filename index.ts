// src/index.ts
// import { runEvaluations as runEvaluationsScript } from './src/scripts/run-evals'

import MCPClientWrapper from './src/mcp/MCPClient';
import MCPServerWrapper from './src/mcp/MCPServer';
import { ProviderFactory } from './src/providers/ProviderFactory';
import { OpenAIProvider } from './src/providers/OpenAIProvider';
import { ClaudeProvider } from './src/providers/ClaudeProvider';
import { ToolDefinitions } from './src/tools/ToolDefinitions';
import Cache from './src/utils/Cache';
import logger from './src/utils/Logger';
// import runEvals from './src/evals/EvaluationRunner';
import type { ToolDefinition } from './src/tools/ToolDefinitions';
import type {
  ModelProvider,
  ModelProviderOptions,
  JSONSchema,
  ModelMessage,
  ModelToolCall,
  ToolFunction,
  ToolResult,
} from './src/providers/ModelProvider';

export {
  MCPClientWrapper,
  MCPServerWrapper,
  ProviderFactory,
  OpenAIProvider,
  ClaudeProvider,
  ToolDefinitions,
  Cache,
  logger,
  // runEvaluationsScript,
  // runEvals
};

export type {
  ToolDefinition,
  ModelProvider,
  ModelProviderOptions,
  JSONSchema,
  ModelMessage,
  ModelToolCall,
  ToolFunction,
  ToolResult,
};