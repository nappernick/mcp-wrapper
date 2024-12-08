// src/mcp/MCPServer.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Readable, Writable } from 'node:stream';
import { z } from 'zod';
import logger from '../utils/Logger';
import type { ModelProvider } from '../providers/ModelProvider';
import fs from 'fs/promises';
import path from 'path';
import { cleanJsonResponse } from '../evals/TestsCases';

class MCPServerWrapper {
  private server: Server;
  private transport: StdioServerTransport;
  private modelProvider: ModelProvider;

  constructor(
    name: string,
    version: string,
    modelProvider: ModelProvider
  ) {
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

    this.transport = new StdioServerTransport(process.stdin as Readable, process.stdout as Writable);

    this.modelProvider = modelProvider;

    this.setupHandlers();
  }

  private setupHandlers() {
    // Request schema for model/generate
    const generateRequestSchema = z.object({
      method: z.literal('model/generate'),
      params: z.object({
        prompt: z.string(),
        options: z.object({
          maxTokens: z.number().optional(),
          temperature: z.number().optional(),
          topP: z.number().optional(),
          stopSequences: z.array(z.string()).optional(),
        }).optional(),
      }).optional(),
    });

    const generateResponseSchema = z.object({
      content: z.string(),
    });

    // Request schema for resources/read
    const readResourceRequestSchema = z.object({
      method: z.literal('resources/read'),
      params: z.object({
        uri: z.string(),
      }),
    });

    const TextResourceContentSchema = z.object({
      uri: z.string(),
      mimeType: z.string().optional(),
      text: z.string(),
    });

    const BlobResourceContentSchema = z.object({
      uri: z.string(),
      mimeType: z.string().optional(),
      blob: z.string(),
    });

    const readResourceResponseSchema = z.object({
      contents: z.array(z.union([TextResourceContentSchema, BlobResourceContentSchema])),
    });

    // Handler for model/generate
    this.server.setRequestHandler(
      generateRequestSchema,
      async (request) => {
        try {
          if (!request.params) {
            throw new Error('Missing params in request');
          }

          const { prompt, options } = request.params;
          if (!prompt) {
            throw new Error('Missing prompt in request params');
          }

          const content = await this.modelProvider.generateResponse(prompt, options);
          // Clean the response before returning
          const cleanedContent = cleanJsonResponse(content);
          return generateResponseSchema.parse({ content: cleanedContent });
        } catch (error: any) {
          logger.error(`Error processing model/generate: ${error.message}`, { error });
          throw new Error(`Error processing model/generate: ${error.message}`);
        }
      }
    );

    // Read Resource Handler
    this.server.setRequestHandler(
      readResourceRequestSchema,
      async (request) => {
        try {
          const { uri } = request.params;

          // Validate the URI format
          const url = new URL(uri);
          if (url.protocol !== 'file:') {
            throw new Error('Unsupported URI protocol. Only file:// is supported.');
          }

          // Resolve file path from URI
          const filePath = path.resolve(url.pathname);

          // Read the file content
          const content = await fs.readFile(filePath);

          // Determine if content is text or binary
          const isText = true; // Adjust this logic as needed based on your use case

          let resourceContent;
          if (isText) {
            resourceContent = {
              uri,
              text: content.toString('utf-8'),
              mimeType: 'text/plain',
            };
          } else {
            resourceContent = {
              uri,
              blob: content.toString('base64'),
              mimeType: 'application/octet-stream',
            };
          }

          return readResourceResponseSchema.parse({
            contents: [resourceContent],
          });
        } catch (error: any) {
          logger.error(`Failed to read resource: ${error.message}`, { error });
          throw new Error(`Failed to read resource: ${error.message}`);
        }
      }
    );
  }

  async start(): Promise<void> {
    try {
      await this.server.connect(this.transport);
      logger.info('MCP Server started and connected.');
    } catch (error: any) {
      logger.error(`Failed to start MCP server: ${error.message}`);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      await this.server.close();
      logger.info('MCP Server disconnected.');
    } catch (error: any) {
      logger.error(`Failed to stop MCP server: ${error.message}`);
      throw error;
    }
  }
}

export default MCPServerWrapper;