// src/providers/ClaudeProvider.ts
import { ModelProvider, ModelProviderOptions, ToolFunction, ModelMessage, ModelToolCall, ToolResult } from './ModelProvider';
import Anthropic from '@anthropic-ai/sdk';
import logger from '../utils/Logger';

interface AnthropicToolResultBlock {
  type: 'tool_result';
  content: string;
  tool_use_id: string;
  is_error?: boolean;
}

function toAnthropicTool(t: ToolFunction): Anthropic.Messages.Tool {
  return {
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Messages.Tool.InputSchema
  };
}

type ClaudeToolUseBlock = {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}

type ClaudeTextBlock = {
  type: 'text';
  text: string;
}

type ClaudeContentBlock = ClaudeToolUseBlock | ClaudeTextBlock;

export class ClaudeProvider implements ModelProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
    logger.info('ClaudeProvider initialized.');
  }

  async generateResponse(prompt: string, options: ModelProviderOptions = {}): Promise<string> {
    logger.info('Generating response with Claude (no tools).', { prompt, options });

    const response = await this.client.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens ?? 4000,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 1.0,
      stop_sequences: options.stopSequences,
    });

    const textContent = response.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('')
      .trim();
    return textContent;
  }

  private toAnthropicMessages(messages: ModelMessage[]): any[] {
    return messages.map(m => ({
      role: m.role,
      content: [{ type: 'text', text: m.content }]
    }));
  }

  async generateWithTools(
    messages: ModelMessage[],
    tools: ToolFunction[],
    options: ModelProviderOptions = {}
  ): Promise<{ response?: string; toolCalls?: ModelToolCall[] }> {
    logger.info('Generating response with Claude (with tools)...');
  
    const anthMessages = this.toAnthropicMessages(messages);
    const anthTools = tools.map(toAnthropicTool);
  
    const response = await this.client.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      messages: anthMessages,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 1.0,
      stop_sequences: options.stopSequences,
      tools: anthTools, 
    });
  
    // Claude returns tool calls as 'tool_use' blocks
    const toolUses = response.content.filter((c): c is ClaudeToolUseBlock => c.type === 'tool_use');
    
  if (toolUses.length > 0) {
    const calls: ModelToolCall[] = toolUses
      .map(tu => {
        // Check if name is present
        if (!tu.name) {
          return null; // skip this malformed tool
        }
        return { name: tu.name, arguments: tu.input };
      })
      .filter((c): c is ModelToolCall => c !== null);

    if (calls.length > 0) {
      return { toolCalls: calls };
    }
  }
  
    // No tool calls, return the textual response
    const textContent = response.content
      .filter((c): c is ClaudeTextBlock => c.type === 'text')
      .map(c => c.text)
      .join('')
      .trim();
    return { response: textContent };
  }

  async continueWithToolResult(
    messages: ModelMessage[],
    tools: ToolFunction[],
    toolResults: ToolResult[],
    options: ModelProviderOptions = {}
  ): Promise<{ response: string }> {
    logger.info('Continuing with tool result (Claude)...');

    const tool_use_id = "some_tool_call_id";

    const anthMessages = this.toAnthropicMessages(messages);

    const toolResultBlocks: AnthropicToolResultBlock[] = toolResults.map(tr => ({
      type: 'tool_result',
      tool_use_id: tool_use_id,
      content: typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result)
    }));

    const toolResultMessage = {
      role: 'user' as const,
      content: toolResultBlocks
    };

    const finalMessages = [...anthMessages, toolResultMessage];

    const response = await this.client.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      messages: finalMessages,
      max_tokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 1.0,
    });

    const textContent = response.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('')
      .trim();
    return { response: textContent };
  }
}
