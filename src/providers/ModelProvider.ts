// src/providers/ModelProvider.ts
export type ProviderName = 'openai' | 'anthropic';

export interface ModelProviderOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
}

export interface JSONSchema {
  type: 'object';
  properties: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolFunction {
  name: string;
  description: string;
  input_schema: JSONSchema; // unified schema
}

export interface ModelMessage {
  role: 'user' | 'assistant' | 'system' | 'tool' | 'function';
  content: string;
}

export interface ModelToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  name: string;
  result: any;
  tool_use_id?: string;
}

export interface ModelProvider {
  generateResponse(prompt: string, options?: ModelProviderOptions): Promise<string>;

  generateWithTools(
    messages: ModelMessage[],
    tools: ToolFunction[],
    options?: ModelProviderOptions
  ): Promise<{ response?: string; toolCalls?: ModelToolCall[] }>;

  continueWithToolResult(
    messages: ModelMessage[],
    tools: ToolFunction[],
    toolResults: ToolResult[],
    options?: ModelProviderOptions
  ): Promise<{ response: string }>;
}
