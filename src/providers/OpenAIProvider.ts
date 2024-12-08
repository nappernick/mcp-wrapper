// src/providers/OpenAIProvider.ts
import type { ModelProvider, ModelProviderOptions, ToolFunction, ModelMessage, ModelToolCall, ToolResult } from './ModelProvider';
import OpenAI from 'openai';
import logger from '../utils/Logger';

function toOpenAIFunction(t: ToolFunction): OpenAI.Chat.Completions.ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as unknown as Record<string, unknown>,
      strict: null,
    },
  };
}


export class OpenAIProvider implements ModelProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
    logger.info('OpenAIProvider initialized.');
  }

  async generateResponse(prompt: string, options: ModelProviderOptions = {}): Promise<string> {
    logger.info('Generating response with OpenAI (no tools).', { prompt, options });
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-2024-11-20',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens ?? 4000,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 1.0,
      stop: options.stopSequences,
    });
    const content = response.choices[0]?.message?.content?.trim() || '';
    return content;
  }

  async generateWithTools(
    messages: ModelMessage[],
    tools: ToolFunction[],
    options: ModelProviderOptions = {}
  ): Promise<{ response?: string; toolCalls?: ModelToolCall[] }> {
    logger.info('Generating response with OpenAI (with tools)...');

    const openaiMessages = messages.map(m => {
      if (m.role === 'tool') {
        return {
          role: 'function' as const,
          name: 'unknown_function',
          content: m.content
        };
      } else if (m.role === 'function') {
        return {
          role: 'function' as const,
          name: (m as any).functionName || 'unknown_function',
          content: m.content
        };
      } else {
        return {
          role: m.role as 'system'|'user'|'assistant',
          content: m.content
        };
      }
    });

    const functions = tools.map(toOpenAIFunction);

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-2024-11-20',
      messages: openaiMessages,
      max_tokens: options.maxTokens ?? 1000,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 1.0,
      stop: options.stopSequences,
      tools: functions,
    });

    const choice = response.choices[0];

    // Check for tool_calls
    const toolCalls = choice.message?.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      const calls = toolCalls.map(tc => {
        const fnName = tc.function.name;
        const args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        return { name: fnName, arguments: args };
      });
      return { toolCalls: calls };
    }

    // Fallback to function_call if no tool_calls (for backward compatibility)
    const fc = choice.message?.function_call;
    if (fc) {
      const args = fc.arguments ? JSON.parse(fc.arguments) : {};
      return { toolCalls: [{ name: fc.name!, arguments: args }] };
    }

    const content = choice.message?.content?.trim() || '';
    return { response: content };
  }

  async continueWithToolResult(
    messages: ModelMessage[],
    tools: ToolFunction[],
    toolResults: ToolResult[],
    options: ModelProviderOptions = {}
  ): Promise<{ response: string }> {
    logger.info('Continuing with tool result (OpenAI)...');

    const openaiMessages = messages.map(m => {
      if (m.role === 'function') {
        return {
          role: 'function' as const,
          name: (m as any).functionName || 'unknown_function',
          content: m.content,
        };
      }
      if (m.role === 'tool') {
        return {
          role: 'function' as const,
          name: 'unknown_function',
          content: m.content
        };
      }
      return {
        role: m.role as 'system'|'user'|'assistant',
        content: m.content
      };
    });

    const functionMessages = toolResults.map(tr => ({
      role: 'function' as const,
      name: tr.name,
      content: JSON.stringify(tr.result),
    }));

    const finalMessages = [...openaiMessages, ...functionMessages];

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-2024-11-20',
      messages: finalMessages,
      max_tokens: options.maxTokens ?? 1000,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 1.0,
      stop: options.stopSequences,
    });

    const content = response.choices[0]?.message?.content?.trim() || '';
    return { response: content };
  }
}
