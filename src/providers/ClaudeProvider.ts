import { ModelProvider, ModelProviderOptions, ToolFunction, ModelMessage, ModelToolCall, ToolResult } from './ModelProvider';
import Anthropic from '@anthropic-ai/sdk';
import logger from '../utils/Logger';

import type { MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages.mjs';
interface AnthropicToolResultBlock {
  type: 'tool_result';
  content: string;
  tool_call_id: string;
}

type ClaudeToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

type ClaudeContent = {
  type: 'text' | 'tool_calls';
  text?: string;
  tool_calls?: ClaudeToolCall[];
};

type ClaudeTextBlock = {
  type: 'text';
  text: string;
}

type ClaudeToolBlock = {
  type: 'text';
  tool_calls: ClaudeToolCall[];
}

export class ClaudeProvider implements ModelProvider {
  private client: Anthropic;
  private model = 'claude-3-sonnet-20240229';

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
    logger.info('ClaudeProvider initialized.');
  }

  private conversationHistory: ModelMessage[] = [];

  private convertToAnthropicTools(tools: ToolFunction[]): any[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object',
        properties: tool.input_schema.properties,
        required: tool.input_schema.required || []
      }
    }));
  }

  private convertToAnthropicMessages(messages: ModelMessage[]): any[] {
    return messages.map(msg => ({
      role: msg.role === 'system' ? 'user' : msg.role,
      content: msg.content
    }));
  }

  async generateResponse(prompt: string, options: ModelProviderOptions = {}): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0.7,
      });

      // Handle the content block correctly using type predicates
      const textBlocks = response.content.filter((block): block is ClaudeTextBlock => 
        block.type === 'text'
      );
      
      return textBlocks.map(block => block.text).join(' ').trim();
    } catch (error) {
      logger.error('Failed to generate response:', error);
      throw error;
    }
  }

  async generateWithTools(
    messages: ModelMessage[],
    tools: ToolFunction[],
    options: ModelProviderOptions = {}
  ): Promise<{ response?: string; toolCalls?: ModelToolCall[] }> {
    try {
      logger.info('Generating response with Claude (with tools)...');

      const response = await this.client.messages.create({
        model: this.model,
        messages: this.convertToAnthropicMessages(messages),
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0.7,
        tools: this.convertToAnthropicTools(tools),
      });

      // Handle tool calls if present
      const toolUseBlocks = response.content.filter(
        (block: any) => block.type === 'tool_use'
      );

      console.log("\n\n\n\n\n\nTOOL USE BLOCKS", toolUseBlocks);

      // Get text content from response
      const textContent = response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join(' ')
        .trim();

      if (toolUseBlocks.length > 0) {
        const toolCalls = toolUseBlocks.map((block: any) => ({
          id: block.id,
          name: block.name,
          arguments: block.input
        })).filter(call => call.name); // Only include calls with valid names

        // If we have valid tool calls, return them
        if (toolCalls.length > 0) {
          return { toolCalls };
        }
      }

      // Return text response if no valid tool calls
      return { response: textContent || 'I will call a tool now.' };
    } catch (error) {
      logger.error('Failed to generate with tools:', error);
      throw error;
    }
  }

  async continueWithToolResult(
    messages: ModelMessage[],
    tools: ToolFunction[],
    toolResults: ToolResult[],
    options: ModelProviderOptions = {}
  ): Promise<{ response: string }> {
    try {
      logger.info('Continuing with tool result (Claude)...');

      // Update conversation history
      if (this.conversationHistory.length === 0) {
        this.conversationHistory = [...messages];
      }

      // Add tool results to conversation as JSON strings
      toolResults.forEach((result) => {
        const toolResultContent = JSON.stringify({
          type: 'tool_result',
          tool_use_id: 'id' in result ? result.id : '9999',
          content: typeof result.result === 'string' ? result.result : JSON.stringify(result.result)
        });

        this.conversationHistory.push({
          role: 'user',
          content: toolResultContent
        });
      });

      console.log("\n\nMessages being sent to Claude:", 
        JSON.stringify(this.conversationHistory, null, 2));

      const response = await this.client.messages.create({
        model: this.model,
        messages: this.convertToAnthropicMessages(this.conversationHistory),
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0.7,
        tools: this.convertToAnthropicTools(tools),
      });

      // Add Claude's response to history
      const textContent = response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join(' ')
        .trim();

      if (textContent) {
        this.conversationHistory.push({
          role: 'assistant',
          content: textContent
        });
      }

      return { response: textContent };
    } catch (error) {
      logger.error('Failed to continue with tool result:', error);
      throw error;
    }
  }
}