#!/usr/bin/env bun
import MCPServerWrapper from '../mcp/MCPServer';
import { ProviderFactory } from '../providers/ProviderFactory';
import config from '../config/config';
import logger from '../utils/Logger';

console.log("Starting MCP server script...");

async function startServer() {
  const provider = ProviderFactory.getProvider({
    providerName: config.PROVIDER_NAME,
    apiKey: config.PROVIDER_NAME === 'openai' ? config.OPENAI_API_KEY : config.CLAUDE_API_KEY,
  });

  logger.debug(`Config: ${config.PROVIDER_NAME} & ${config.OPENAI_API_KEY || config.CLAUDE_API_KEY}`);
  logger.debug(`Using ${config.PROVIDER_NAME === 'openai' ? 'OpenAI' : 'Claude'} Provider.`);

  const server = new MCPServerWrapper('mcp-server', '1.0.0', provider);

  try {
    await server.start();
    logger.info('MCP Server is up and running.');

    // Keep the server running
    process.stdin.resume();
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
