import { z } from "zod";
import logger from "../utils/Logger";
import type {
  ModelProviderOptions,
  ModelMessage,
  ToolFunction,
  ModelToolCall,
  ToolResult,
} from "../providers/ModelProvider";

import MCPServerWrapper from "./MCPServer";

export interface MCPClientInterface {
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
  readResource(uri: string): Promise<string>;
}

class MCPClientWrapper implements MCPClientInterface {
  private server: MCPServerWrapper;

  constructor(server: MCPServerWrapper) {
    this.server = server;
  }

  async generateResponse(
    prompt: string,
    options?: ModelProviderOptions
  ): Promise<string> {
    const request = {
      jsonrpc: "2.0",
      method: "generate",
      params: {
        prompt,
        options,
      },
      id: "1",
    };

    const response = await this.server.handleRequest(request);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.result.content;
  }

  async generateWithTools(
    messages: ModelMessage[],
    tools: ToolFunction[],
    options?: ModelProviderOptions
  ): Promise<{ response?: string; toolCalls?: ModelToolCall[] }> {
    const request = {
      jsonrpc: "2.0",
      method: "generate_with_tools",
      params: {
        messages,
        tools,
        options,
      },
      id: "1",
    };

    const response = await this.server.handleRequest(request);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.result;
  }

  async continueWithToolResult(
    messages: ModelMessage[],
    tools: ToolFunction[],
    toolResults: ToolResult[],
    options?: ModelProviderOptions
  ): Promise<{ response: string }> {
    const request = {
      jsonrpc: "2.0",
      method: "continue_with_tool_result",
      params: {
        messages,
        tools,
        toolResults,
        options,
      },
      id: "1",
    };

    const response = await this.server.handleRequest(request);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.result;
  }

  async readResource(uri: string): Promise<string> {
    logger.debug("In readResource...");
    const request = {
      jsonrpc: "2.0",
      method: "resources/read",
      params: {
        uri,
      },
      id: "1",
    };

    const response = await this.server.handleRequest(request);
    if (response.error) {
      throw new Error(response.error.message);
    }

    const contents = response.result.contents;
    if (contents && contents.length > 0) {
      const content = contents[0];
      if ("text" in content && content.text) {
        return content.text as string;
      } else if ("blob" in content && content.blob) {
        return Buffer.from(String(content.blob), "base64").toString();
      } else {
        throw new Error("No text or blob content found.");
      }
    } else {
      throw new Error("No contents returned from readResource.");
    }
  }
}

export default MCPClientWrapper;