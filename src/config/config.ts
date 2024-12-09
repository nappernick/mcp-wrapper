// src/config/config.ts
import dotenv from 'dotenv';
import path from 'node:path';
import logger from '../utils/Logger';

dotenv.config();

// Force reload of .env file
dotenv.config({ override: true, path: path.resolve(process.cwd(), '.env') });


interface Config {
  OPENAI_API_KEY: string;
  CLAUDE_API_KEY: string;
  PROVIDER_NAME: 'openai' | 'anthropic';
  MCP_SERVER_COMMAND: string;
  MCP_SERVER_ARGS?: string[];
  CACHE_TTL: number;
  MCP_SERVER_HOST?: string;
  MCP_SERVER_PORT?: number
}

const CONFIG: Config = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  CLAUDE_API_KEY: process.env.CLAUDE_API_KEY || '',
  PROVIDER_NAME: (process.env.PROVIDER_NAME as 'openai' | 'anthropic') || 'anthropic',
  MCP_SERVER_COMMAND: process.env.MCP_SERVER_COMMAND || 'node',
  MCP_SERVER_ARGS: process.env.MCP_SERVER_ARGS ? process.env.MCP_SERVER_ARGS.split(' ') : [],
  CACHE_TTL: parseInt(process.env.CACHE_TTL || '3600'),
};

// Validate Config
if (
  (CONFIG.PROVIDER_NAME === 'openai' && !CONFIG.OPENAI_API_KEY) ||
  (CONFIG.PROVIDER_NAME === 'anthropic' && !CONFIG.CLAUDE_API_KEY)
) {
  logger.error('API keys must be set in the environment variables.');
  process.exit(1);
}

export default CONFIG;