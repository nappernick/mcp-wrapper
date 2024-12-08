// src/mcp/MCPClient.ts
import {
  Client,
  ClientOptions,
} from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import logger from "../utils/Logger";
import type { 
  ModelProviderOptions, 
  ModelMessage, 
  ToolFunction, 
  ModelToolCall, 
  ToolResult,
  ModelProvider
} from "../providers/ModelProvider";
import { ProviderFactory } from "../providers/ProviderFactory";
import { ChildProcessWithoutNullStreams } from "child_process";

interface MCPClientConfig {
  serverCommand: string;
  serverPath: string;
  serverArgs?: string[];
  env?: Record<string, string>;
  providerName: 'openai' | 'anthropic';
}



export interface MCPClientInterface {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
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

class MCPClientWrapper implements MCPClientInterface {
  private client: Client;
  private transport: StdioClientTransport;
  private serverProcess?: ChildProcessWithoutNullStreams;
  private clientStarted: boolean;
  private transportStarted: boolean;
  private provider: ModelProvider;

  constructor(config: MCPClientConfig, clientOptions?: ClientOptions) {
    this.clientStarted = false;
    this.transportStarted = false;

    this.transport = new StdioClientTransport({
      command: "bun",
      args: ["run", config.serverPath, ...(config.serverArgs || [])],
      env: config.env,
    });

    this.client = new Client(
      {
        name: "MCPClient",
        version: "1.0.0",
      },
      clientOptions || {
        capabilities: {},
      }
    );

    this.provider = ProviderFactory.getProvider({
      providerName: config.providerName,
      apiKey: config.providerName === 'openai' ? process.env.OPENAI_API_KEY! : process.env.CLAUDE_API_KEY!
    });
  }

  async connect(): Promise<void> {
    if (!this.clientStarted) {
      try {
        await this.client.connect(this.transport);
        this.clientStarted = true;
        this.transportStarted = true;
        logger.info("Connected to MCP server.");
      } catch (error: any) {
        logger.error("Failed to connect to MCP server:", error);
        throw error;
      }
    } else {
      logger.info("Client already started...");
    }
  }

  async generateResponse(
    prompt: string,
    options?: ModelProviderOptions
  ): Promise<string> {
    try {
      const responseSchema = z.object({
        content: z.string(),
      });

      const response = await this.client.request(
        {
          method: "model/generate",
          params: {
            prompt,
            options,
          },
        },
        responseSchema
      );

      logger.info("Generated response from MCP server.");
      return response.content;
    } catch (error: any) {
      logger.error(`Failed to generate response: ${error.message}`, { error });
      throw error;
    }
  }

  async generateWithTools(
    messages: ModelMessage[],
    tools: ToolFunction[],
    options?: ModelProviderOptions
  ): Promise<{ response?: string; toolCalls?: ModelToolCall[] }> {
    try {
      return await this.provider.generateWithTools(messages, tools, options);
    } catch (error: any) {
      logger.error(`Failed to generate with tools: ${error.message}`);
      throw error;
    }
  }

  async continueWithToolResult(
    messages: ModelMessage[],
    tools: ToolFunction[],
    toolResults: ToolResult[],
    options?: ModelProviderOptions
  ): Promise<{ response: string }> {
    try {
      return await this.provider.continueWithToolResult(messages, tools, toolResults, options);
    } catch (error: any) {
      logger.error(`Failed to continue with tool result: ${error.message}`);
      throw error;
    }
  }

  async readResource(uri: string): Promise<string> {
    logger.debug("In readResource...");
    try {
      const response = await this.client.readResource({ uri });
      logger.info(`Read resource from URI: ${uri}`);

      if (response.contents && response.contents.length > 0) {
        const content = response.contents[0];
        if ("text" in content && content.text) {
          logger.debug;
          return content.text as string;
        } else if ("blob" in content && content.blob) {
          // Handle blob content if necessary
          return Buffer.from(String(content.blob), 'base64').toString();
        } else {
          throw new Error("No text or blob content found.");
        }
      } else {
        throw new Error("No contents returned from readResource.");
      }
    } catch (error: any) {
      logger.error(
        `Failed to read resource from URI "${uri}": ${error.message}`,
        { error }
      );
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.close();
      this.clientStarted = false;
      logger.info("Disconnected from MCP server.");
    } catch (error: any) {
      logger.error(`Failed to disconnect MCP client: ${error.message}`, {
        error,
      });
      throw error;
    }

    if (
      this.transport &&
      (this.transport as any)._process &&
      !(this.transport as any)._process.killed
    ) {
      (this.transport as any)._process.kill();
      logger.info("MCP Server process terminated.");
    }
  }

  isStartedClient(): boolean {
    return this.clientStarted;
  }

  isStartedTransport(): boolean {
    return this.transportStarted;
  }
}

export default MCPClientWrapper;
