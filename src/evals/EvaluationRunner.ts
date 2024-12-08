// src/evals/EvaluationRunner.ts
import type { ModelProviderOptions, ToolFunction } from "../providers/ModelProvider";
import Evaluator from "./Evaluator";
import { TestCases } from "./TestsCases";
import { CustomerFeedbackAnalysisSchema } from "./Schemas";
import MCPClientWrapper from "../mcp/MCPClient";
import { ProviderFactory } from "../providers/ProviderFactory";
import config from "../config/config";
import Cache from "../utils/Cache";
import logger from "../utils/Logger";
import path from "path";
import { green, red, yellow, cyan, bold } from "colorette";

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
    providerName: config.PROVIDER_NAME 
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

    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;

    // Run tests for both providers
    const providersToTest = ['openai', 'anthropic'] as const;
    for (const providerName of providersToTest) {
      console.log(`\n${bold(cyan(`=== Running tests for provider: ${providerName} ===`))}`);
      const provider = ProviderFactory.getProvider({
        providerName,
        apiKey: providerName === 'openai' ? config.OPENAI_API_KEY : config.CLAUDE_API_KEY,
      });
  
      for (const testCase of TestCases) {
        totalTests++;
        const { prompt, expected, schema, requiresTool, toolName, description } = testCase;
        console.log(bold(`Test: ${description} (Provider: ${providerName})\nPrompt: ${prompt}`));

        try {
          if (requiresTool) {
            // Use our strictly typed tools
            const tools: ToolFunction[] = [
              {
                name: 'get_weather',
                description: 'Get weather info given a place',
                input_schema: {
                  type: 'object',
                  properties: {
                    location: { type: 'string', description: 'City name' },
                    unit: { type: 'string', enum: ['celsius','fahrenheit'] }
                  },
                  required: ['location'],
                  additionalProperties: false
                }
              },
              {
                name: 'calculate_sum',
                description: 'Calculate sum of two numbers',
                input_schema: {
                  type: 'object',
                  properties: {
                    a: {type:'number'},
                    b: {type:'number'}
                  },
                  required: ['a','b'],
                  additionalProperties: false
                }
              },
              {
                name: 'get_location',
                description: 'Get user location',
                input_schema: {
                  type:'object',
                  properties:{},
                  required: [],
                  additionalProperties: false
                }
              }
            ];

            const res = await provider.generateWithTools(
              [{role:'user',content:prompt}],
              tools
            );

            if (res.toolCalls && res.toolCalls.length > 0) {
              console.log(`Tool calls made: ${JSON.stringify(res.toolCalls)}`);
              if (toolName && !res.toolCalls.some(tc => tc.name === toolName)) {
                console.log(yellow(`⚠ Expected tool "${toolName}" but got: ${JSON.stringify(res.toolCalls)}`));
                totalFailed++;
              } else {
                console.log(green(`✓ Correct tool used or at least a tool was used as expected.`));
                // If schema expected after tool result:
                if (schema && expected) {
                  const toolResult: any = { result: "8" }; // For calculate_sum scenario
                  const finalRes = await provider.continueWithToolResult(
                    [{role:'user', content:prompt}],
                    tools,
                    [{name: toolName || 'unknown_function', result: toolResult}]
                  );
                  let finalParsed: any;
                  try {
                    finalParsed = JSON.parse(finalRes.response);
                  } catch {
                    console.log(yellow(`⚠ Final response not JSON parseable: ${finalRes.response}`));
                    totalFailed++;
                    continue;
                  }
                  const evaluation = evaluator.runEvaluation(prompt, expected, finalParsed, schema);
                  if (evaluation.passed) {
                    console.log(green(`✓ Evaluation passed for prompt: "${prompt}" on ${providerName}`));
                    totalPassed++;
                  } else {
                    console.log(red(`✗ Evaluation failed for prompt: "${prompt}" on ${providerName}`));
                    if (evaluation.errors) evaluation.errors.forEach(e => console.log(red('  - '+e)));
                    totalFailed++;
                  }
                } else {
                  // No schema/expected check, assume passed
                  totalPassed++;
                }
              }
            } else {
              console.log(yellow(`⚠ No tool calls made for a requiresTool scenario: ${prompt}`));
              totalFailed++;
            }

          } else {
            // No tools required scenario
            const llmResponse = await mcpClient.generateResponse(prompt, {maxTokens:4000, temperature:0.0});
            console.log(`LLM response: ${llmResponse}`);

            if (typeof expected === 'string') {
              if (!llmResponse.includes(expected)) {
                console.log(yellow(`⚠ Expected substring "${expected}" not found in LLM response.`));
                totalFailed++;
              } else {
                console.log(green(`✓ Evaluation passed (substring found).`));
                totalPassed++;
              }
            } else if (expected && schema) {
              let parsed: any;
              try {
                const cleaned = (testCase.cleanResponse ? testCase.cleanResponse(llmResponse): llmResponse);
                parsed = JSON.parse(cleaned);
              } catch (error) {
                console.log(yellow(`⚠ JSON parse error for prompt ${prompt}: ${error}`));
                totalFailed++;
                continue;
              }
              const evaluation = evaluator.runEvaluation(prompt, expected, parsed, schema);
              if (evaluation.passed) {
                console.log(green(`✓ Evaluation passed for prompt: "${prompt}" on ${providerName}`));
                totalPassed++;
              } else {
                console.log(red(`✗ Evaluation failed for prompt: "${prompt}" on ${providerName}`));
                if (evaluation.errors) evaluation.errors.forEach(e => console.log(red('  - '+e)));
                totalFailed++;
              }
            } else {
              console.log(cyan(`No special checks - prompt completed.`));
              // If no checks, consider it a "neutral" pass scenario
              totalPassed++;
            }
          }
        } catch (error: any) {
          console.log(red(`✗ Failed during evaluation for prompt "${prompt}" on ${providerName}: ${error.message}`));
          totalFailed++;
        }

        console.log(''); // blank line for readability
      }
    }
    // After all tests complete, print a summary
    console.log(bold(cyan(`\n=== Summary ===`)));
    console.log(`Total tests: ${totalTests}`);
    console.log(`${green('Passed:')} ${totalPassed}`);
    console.log(`${red('Failed:')} ${totalFailed}`);
    if (totalFailed === 0) {
      console.log(green("All tests passed successfully! 🎉"));
    } else {
      console.log(red("Some tests failed. Check the logs above for details."));
    }

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
