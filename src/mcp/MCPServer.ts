// mcp-wrapper/src/mcp/MCPServer.ts

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { z } from "zod";
import logger from "../utils/Logger";
import fs from "fs/promises";
import path from "node:path";
import type {
  ModelProvider,
  ModelMessage,
  ToolFunction,
  ToolResult,
  ModelProviderOptions,
} from "../providers/ModelProvider";

export interface ToolHandlers {
  [key: string]: (args: any) => Promise<any>;
}

export interface MCPServerOptions {
  toolHandlers: ToolHandlers;
}

class MCPServerWrapper {
  private server: Server;
  private modelProvider: ModelProvider | null = null;
  private toolHandlers: ToolHandlers | null = null;

  // Map to store request handlers
  private requestHandlers: Map<string, (request: any) => Promise<any>> = new Map();

  constructor(name: string, version: string) {
    this.server = new Server(
      {
        name,
        version,
      },
      {
        capabilities: {
          resources: {},
        },
      }
    );
  }

  public setModelProvider(modelProvider: ModelProvider) {
    this.modelProvider = modelProvider;
    this.trySetupHandlers();
  }

  public setToolHandlers(toolHandlers: ToolHandlers) {
    this.toolHandlers = toolHandlers;
    this.trySetupHandlers();
  }

  private trySetupHandlers() {
    if (this.modelProvider && this.toolHandlers) {
      this.setupHandlers();
    }
  }

  private setupHandlers() {
    // Handler for "generate" method
    const generateSchema = z.object({
      method: z.literal("generate"),
      params: z.object({
        prompt: z.string(),
        options: z.any().optional(),
      }),
      id: z.union([z.string(), z.number()]),
    });

    const generateHandler = async (request: any) => {
      try {
        const { prompt, options } = request.params;
        // @ts-ignore
        const content = await this.modelProvider.generateResponse(prompt, options);
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: { content },
        };
      } catch (error: any) {
        logger.error(`Error processing generate: ${error.message}`, {
          error,
        });
        return {
          jsonrpc: "2.0",
          id: request.id || null,
          error: {
            code: -32000,
            message: error.message,
          },
        };
      }
    };

    this.requestHandlers.set("generate", generateHandler);

    // Handler for "generate_with_tools" method
    const generateWithToolsSchema = z.object({
      method: z.literal("generate_with_tools"),
      params: z.object({
        messages: z.array(
          z.object({
            role: z.enum(["user", "assistant", "system", "function"]),
            content: z.string().optional(),
            name: z.string().optional(),
          })
        ),
        tools: z.array(
          z.object({
            name: z.string(),
            description: z.string(),
            input_schema: z.any().optional(), // Made optional here
          })
        ),
        options: z.any().optional(),
      }),
      id: z.union([z.string(), z.number()]),
    });

    const generateWithToolsHandler = async (request: any) => {
      try {
        const { messages, tools, options } = request.params;
        logger.info("Received generate_with_tools request", {
          messages,
          tools,
          options,
        });

        // @ts-ignore
        const response = await this.modelProvider.generateWithTools(
          messages as ModelMessage[],
          tools as ToolFunction[],
          options
        );

        return {
          jsonrpc: "2.0",
          id: request.id,
          result: response,
        };
      } catch (error: any) {
        logger.error(`Error processing generate_with_tools: ${error.message}`, {
          error,
        });
        return {
          jsonrpc: "2.0",
          id: request.id || null,
          error: {
            code: -32000,
            message: error.message,
          },
        };
      }
    };

    this.requestHandlers.set("generate_with_tools", generateWithToolsHandler);

    // Handler for "continue_with_tool_result" method
    const continueWithToolResultSchema = z.object({
      method: z.literal("continue_with_tool_result"),
      params: z.object({
        messages: z.array(
          z.object({
            role: z.enum(["user", "assistant", "system", "function"]),
            content: z.string().optional(),
            name: z.string().optional(),
          })
        ),
        tools: z.array(
          z.object({
            name: z.string(),
            description: z.string(),
            input_schema: z.any().optional(), // Made optional here
          })
        ),
        toolResults: z.array(
          z.object({
            name: z.string(),
            result: z.any(),
            tool_use_id: z.string().optional(),
          })
        ),
        options: z.any().optional(),
      }),
      id: z.union([z.string(), z.number()]),
    });

    const continueWithToolResultHandler = async (request: any) => {
      try {
        const { messages, tools, toolResults, options } = request.params;
        logger.info("Received continue_with_tool_result request", {
          messages,
          tools,
          toolResults,
          options,
        });

        // @ts-ignore
        const result = await this.modelProvider.continueWithToolResult(
          messages as ModelMessage[],
          tools as ToolFunction[],
          toolResults as ToolResult[],
          options
        );

        return {
          jsonrpc: "2.0",
          id: request.id,
          result: result,
        };
      } catch (error: any) {
        logger.error(`Error processing continue_with_tool_result: ${error.message}`, {
          error,
        });
        return {
          jsonrpc: "2.0",
          id: request.id || null,
          error: {
            code: -32000,
            message: error.message,
          },
        };
      }
    };

    this.requestHandlers.set("continue_with_tool_result", continueWithToolResultHandler);

    // Handler for "resources/read" method
    const resourcesReadSchema = z.object({
      method: z.literal("resources/read"),
      params: z.object({
        uri: z.string(),
      }),
      id: z.union([z.string(), z.number()]),
    });

    const resourcesReadHandler = async (request: any) => {
      try {
        const { uri } = request.params;

        const content = await this.readResource(uri);

        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            contents: [content],
          },
        };
      } catch (error: any) {
        logger.error(`Error processing resources/read: ${error.message}`, {
          error,
        });
        return {
          jsonrpc: "2.0",
          id: request.id || null,
          error: {
            code: -32000,
            message: error.message,
          },
        };
      }
    };

    this.requestHandlers.set("resources/read", resourcesReadHandler);

    // Handler for "call_tool" method
    const callToolSchema = z.object({
      method: z.literal("call_tool"),
      params: z.object({
        name: z.string(),
        arguments: z.record(z.any()),
      }),
      id: z.union([z.string(), z.number()]),
    });

    const callToolHandler = async (request: any) => {
      try {
        const { name, arguments: args } = request.params;
        // @ts-ignore
        const toolHandler = this.toolHandlers[name];
        if (!toolHandler) {
          throw new Error(`Tool handler for '${name}' not found.`);
        }
        const toolResult = await toolHandler(args);
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            result: toolResult,
          },
        };
      } catch (error: any) {
        logger.error(`Error executing tool: ${error.message}`, { error });
        return {
          jsonrpc: "2.0",
          id: request.id || null,
          error: {
            code: -32000,
            message: error.message,
          },
        };
      }
    };

    this.requestHandlers.set("call_tool", callToolHandler);
  }

  private async processGenerateWithTools(request: any): Promise<any> {
    const { messages, tools, options } = request.params;

    try {
      // Step 1: Call generateWithTools on the model provider
      // @ts-ignore
      const initialResult = await this.modelProvider.generateWithTools(messages, tools, options);

      let finalResponse: string | undefined = initialResult.response;
      let toolCalls = initialResult.toolCalls;

      // Step 2: While there are toolCalls, process them
      while (toolCalls && toolCalls.length > 0) {
        const toolResults: ToolResult[] = [];

        for (const toolCall of toolCalls) {
          const toolName = toolCall.name;
          const toolArgs = toolCall.arguments;

          // @ts-ignore
          const toolHandler = this.toolHandlers[toolName];
          if (!toolHandler) {
            throw new Error(`No tool handler found for tool: ${toolName}`);
          }

          // Step 2a: Execute the tool
          const toolResult = await toolHandler(toolArgs);
          toolResults.push({
            name: toolName,
            result: toolResult,
          });
        }

        // Step 3: Call continueWithToolResult with the tool results
          // @ts-ignore
        const continueResult = await this.modelProvider.continueWithToolResult(
          messages,
          tools,
          toolResults,
          options
        );

        finalResponse = continueResult.response;
        // Check if there are more toolCalls
          // @ts-ignore
        toolCalls = continueResult.toolCalls;
      }

      // Step 4: Return the final response to the client
      return {
        jsonrpc: '2.0',
        result: {
          content: finalResponse,
        },
        id: request.id,
      };
    } catch (error: any) {
      logger.error('Error processing generate_with_tools', { error });
      return {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error.message,
          data: error,
        },
        id: request.id,
      };
    }
  }
  

  public async handleRequest(request: any): Promise<any> {
    if (request.method === 'generate_with_tools') {
      return await this.processGenerateWithTools(request);
    }
    const method = request.method;
    const handler = this.requestHandlers.get(method);

    if (!handler) {
      return {
        jsonrpc: "2.0",
        id: request.id || null,
        error: {
          code: -32601, // Method not found
          message: `Method ${method} not found`,
        },
      };
    }

    try {
      // Validate the request using the appropriate schema
      // Since we have schemas, we could store them as well if needed
      return await handler(request);
    } catch (error: any) {
      return {
        jsonrpc: "2.0",
        id: request.id || null,
        error: {
          code: -32000,
          message: error.message,
        },
      };
    }
  }

  private async readResource(uri: string): Promise<any> {
    try {
      // Validate the URI format
      const url = new URL(uri);
      if (url.protocol !== "file:") {
        throw new Error("Unsupported URI protocol. Only file:// is supported.");
      }

      // Resolve file path from URI
      const filePath = path.resolve(url.pathname);

      // Read the file content
      const contentBuffer = await fs.readFile(filePath);

      // Determine if content is text or binary
      const isText = true; // You may want to implement detection logic

      let resourceContent;
      if (isText) {
        resourceContent = {
          uri,
          text: contentBuffer.toString("utf-8"),
          mimeType: "text/plain",
        };
      } else {
        resourceContent = {
          uri,
          blob: contentBuffer.toString("base64"),
          mimeType: "application/octet-stream",
        };
      }

      return resourceContent;
    } catch (error: any) {
      logger.error(`Failed to read resource: ${error.message}`, { error });
      throw new Error(`Failed to read resource: ${error.message}`);
    }
  }
}

export default MCPServerWrapper;