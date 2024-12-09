// mcp-wrapper/src/providers/ProviderFactory.ts
import type { ModelProvider } from './ModelProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { ClaudeProvider } from './ClaudeProvider';
import logger from '../utils/Logger';

interface ProviderConfig {
  providerName: 'anthropic' | 'openai';
  apiKey: string;
}

export class ProviderFactory {
  static getProvider(config: ProviderConfig): ModelProvider {
    const { providerName, apiKey } = config;
    logger.debug(`Config: ${providerName} & ${apiKey}}`)
    switch (providerName) {
      case 'openai':
        logger.info('Using OpenAI Provider.');
        return new OpenAIProvider(apiKey);
      case 'anthropic':
        logger.info('Using Anthropic Provider.');
        return new ClaudeProvider(apiKey);
      default:
        const supported = `'openai' or 'anthropic'`;
        const errorMsg = `Unsupported provider: "${providerName}". Supported providers are: ${supported}.`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
    }
  }
}
