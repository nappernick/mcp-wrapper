// src/evals/EvaluationRunner.ts
import type { ModelProviderOptions } from "../providers/ModelProvider";
import Evaluator from "./Evaluator";
import { TestCases } from "./TestsCases";
import { CustomerFeedbackAnalysisSchema } from "./Schemas";
import MCPClientWrapper from "../mcp/MCPClient";
import { ProviderFactory } from "../providers/ProviderFactory";
import config from "../config/config";
import Cache from "../utils/Cache";
import logger from "../utils/Logger";
import path from "path";

async function runEvals() {
  const evaluator = new Evaluator();
  const cache = new Cache(config.CACHE_TTL);

  // Path to the server script
  const serverScriptPath = path.resolve(__dirname, '../scripts/start-server.ts');

  // Initialize MCP Client
  const mcpClient = new MCPClientWrapper({
    serverCommand: config.MCP_SERVER_COMMAND,
    serverArgs: config.MCP_SERVER_ARGS,
    serverPath: serverScriptPath,
  });

  const started = mcpClient.isStartedClient() && mcpClient.isStartedTransport();
  logger.debug("Client started?", mcpClient.isStartedClient());
  logger.debug("Transport started?", mcpClient.isStartedTransport());

  try {
    if (!started) {
      logger.info("Attempting to connect to MCP server...");
      await mcpClient.connect();
      logger.info("Successfully connected to MCP server");
    } else {
      logger.info("MCP Server already started...");
    }

    const resourceUri = `file://${process.cwd()}/src/data/customer_feedback.txt`;
    // If needed, ensure triple slash: file:///... but file:// + absolute path generally works if URL parsing is correct.
    logger.info(`Reading from: ${resourceUri}`);

    let customerFeedback: string | undefined = cache.get(resourceUri);

    if (!customerFeedback) {
      try {
        customerFeedback = await mcpClient.readResource(resourceUri);
        cache.set(resourceUri, customerFeedback);
        logger.info(`Successfully read customer feedback: ${customerFeedback}`);
      } catch (error: any) {
        logger.error(`Failed to read customer feedback: ${error.message}`);
        throw error;
      }
    }

    // Instantiate Model Provider
    const provider = ProviderFactory.getProvider({
      providerName: config.PROVIDER_NAME,
      apiKey:
        config.PROVIDER_NAME === "openai"
          ? config.OPENAI_API_KEY
          : config.CLAUDE_API_KEY,
    });

    // Iterate through test cases
    for (const testCase of TestCases) {
      const { prompt, expected, schema } = testCase;

      try {
        // Generate response from MCP server
        const llmResponse = await mcpClient.generateResponse(prompt, {
          maxTokens: 4000,
          temperature: 0.0, // Low temperature for consistency
        });
        logger.info(
          `LLM Response for prompt "${testCase.prompt}": ${llmResponse}`
        );

        // Parse JSON response
        let parsedResponse: any;
        try {
          // Clean the response if a cleaning function is provided
          const cleanedResponse = testCase.cleanResponse 
            ? testCase.cleanResponse(llmResponse)
            : llmResponse;
            
          parsedResponse = JSON.parse(cleanedResponse);
        } catch (error: any) {
          logger.error(
            `Failed to parse JSON for prompt "${testCase.prompt}": ${error.message}`
          );
          continue;
        }

        // Run evaluation
        const evaluation = evaluator.runEvaluation(
          prompt,
          expected,
          parsedResponse,
          schema || CustomerFeedbackAnalysisSchema
        );

        if (evaluation.passed) {
          logger.info(`Evaluation passed for prompt: "${prompt}"`);
        } else {
          logger.warn(`Evaluation failed for prompt: "${prompt}"`);
          if (evaluation.errors) {
            evaluation.errors.forEach((err) => logger.warn(`  - ${err}`));
          }
        }
      } catch (error: any) {
        logger.error(
          `Failed during evaluation for prompt "${testCase.prompt}": ${error.message}`
        );
      }
    }
  } catch (error) {
    logger.error("Evaluation failed:", error);
    throw error;
  } finally {
    try {
      await mcpClient.disconnect();
      logger.info("Disconnected from MCP server");
    } catch (error) {
      logger.error("Error during disconnect:", error);
    }
  }
}

export default runEvals;
