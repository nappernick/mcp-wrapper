// mcp-wrapper/src/http-wrapper.ts

import { serve } from 'bun';
import logger from './utils/Logger';
import { initializeAsync, getExaClient, getKGManager } from 'mcp-research-assistant/src/dependencies';

import { LLMClient } from 'mcp-research-assistant/src/llmclient';
import MCPServerWrapper from './mcp/MCPServer';
import MCPClientWrapper from './mcp/MCPClient';
import { handleSearchAndStore } from 'mcp-research-assistant/src/handlers/searchAndStore';
import { summarizeText } from 'mcp-research-assistant/src/tools/summarizeText';
import { translateText } from 'mcp-research-assistant/src/tools/translateText';
import { extractEntities } from 'mcp-research-assistant/src/tools/extractEntities';
import { OpenAIProvider } from '..';

const HTTP_PORT = 8000;

(async () => {
  try {
    // Initialize base dependencies
    await initializeAsync();

    const exaClient = getExaClient();
    const kgManager = getKGManager();

    // Initialize MCPServerWrapper without toolHandlers and ModelProvider
    console.log('8. Initializing MCPServerWrapper...');
    const mcpServer = new MCPServerWrapper('simplified-agent', '1.0.0');
    console.log('9. MCPServerWrapper initialized.');

    // Initialize MCPClientWrapper with mcpServer
    console.log('10. Initializing MCPClientWrapper...');
    const mcpClient = new MCPClientWrapper(mcpServer);
    console.log('11. MCPClientWrapper initialized.');

    // Initialize LLMClient with mcpClient
    console.log('12. Initializing LLMClient...');
    const openAIProvider = new OpenAIProvider(process.env.OPENAI_API_KEY as string); 
    const llmClient = new LLMClient(openAIProvider);
    console.log('13. LLMClient initialized.');

    // Define toolHandlers
    console.log('14. Defining toolHandlers...');
    const toolHandlers = {
      search_and_store: async (args: any) => {
        // @ts-ignore
        return await handleSearchAndStore(args, { exaClient, kgManager, llmClient, logger });
      },
      summarize_text: async (args: any) => {
        // @ts-ignore
        return await summarizeText(args.text, llmClient, logger);
      },
      translate_text: async (args: any) => {
        // @ts-ignore
        return await translateText(args.text, args.targetLanguage, llmClient, logger);
      },
      extract_entities: async (args: any) => {
        // @ts-ignore
        return await extractEntities(args.text, llmClient, logger);
      },
    };
    console.log('15. toolHandlers defined.');

    // Set toolHandlers and ModelProvider in mcpServer
    console.log('16. Setting toolHandlers and modelProvider in MCPServerWrapper...');
    mcpServer.setToolHandlers(toolHandlers);
    mcpServer.setModelProvider(llmClient);
    console.log('17. toolHandlers and modelProvider set in MCPServerWrapper.');

    // Now start the HTTP server
    serve({
      port: HTTP_PORT,
      fetch: async (req) => {
        logger.info(`Received request: ${req.method} ${req.url}`);

        if (req.method === 'POST') {
          try {
            const bodyText = await req.text();
            logger.debug(`Request body: ${JSON.stringify(bodyText)}`);

            const jsonRpcRequest = JSON.parse(bodyText);
            const response = await mcpServer.handleRequest(jsonRpcRequest);

            return new Response(response, {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            });
          } catch (error: any) {
            logger.error('Error processing request:', error);
            return new Response(
              JSON.stringify({
                jsonrpc: '2.0',
                error: {
                  code: -32000,
                  message: error instanceof Error ? error.message : 'Internal error',
                },
                id: null,
              }),
              {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
              }
            );
          }
        }

        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32601, message: 'Method not allowed' },
            id: null,
          }),
          {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      },
    });

    logger.info(`HTTP Wrapper Server listening on port ${HTTP_PORT}`);
  } catch (error: any) {
    logger.error('Failed to initialize server:', error);
    process.exit(1);
  }
})();