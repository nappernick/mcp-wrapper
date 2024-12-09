import { MCPClientWrapper, ProviderFactory } from './index';
import { getWeatherTool, calculateSumTool } from './tools/TestTools';
import config from './config/config';
import logger from './utils/Logger';
import { version } from 'os';

async function main() {
  return "";
  // let client: any;
  // try {
  //   client = new MCPClientWrapper(
  //   );
  
  // } catch (error) {
  //   console.error('Error starting MCP server:', error);
  //   process.exit(1);
  // }

  // try {
  //   await client.connect();
  //   logger.log({ message: 'Connected to MCP server.', level: 'info' });

  //   // Basic Usage
  //   const basicPrompt = 'What is the capital of France?';
  //   const basicResponse = await client.generateResponse(basicPrompt);
  //   logger.log({ 
  //     message: `\nBasic Response:\nPrompt: "${basicPrompt}"\nResponse: "${basicResponse}"`,
  //     level: 'info'
  //   });

  //   // Tool Usage
  //   const weatherPrompt = 'Please use the `get_weather` function to find the weather in San Francisco in celsius.';
  //   const tools = [getWeatherTool];
    
  //   const toolResponse = await client.generateWithTools(
  //     [{ role: 'user', content: weatherPrompt }],
  //     tools
  //   );

  //   if (toolResponse.toolCalls && toolResponse.toolCalls.length > 0) {
  //     for (const toolCall of toolResponse.toolCalls) {
  //       logger.log({ message: `\nTool Called: ${toolCall.name}`, level: 'info' });
  //       logger.log({ message: `Arguments: ${JSON.stringify(toolCall.arguments)}`, level: 'info' });
        
  //       let toolResult;
  //       if (toolCall.name === 'get_weather') {
  //         toolResult = { temperature: '20°C', condition: 'Sunny' };
  //       } else if (toolCall.name === 'calculate_sum') {
  //         const { a, b } = toolCall.arguments;
  //         toolResult = { result: a + b };
  //       } else {
  //         toolResult = { error: 'Unknown tool' };
  //       }
        
  //       const continuedResponse = await client.continueWithToolResult(
  //         [{ role: 'user', content: weatherPrompt }],
  //         tools,
  //         [{ 
  //           name: toolCall.name, 
  //           result: toolResult, 
  //           tool_use_id: ("tool_use_id" in toolCall ? toolCall.tool_use_id : '666') as string 
  //         }]
  //       );
        
  //       logger.log({ 
  //         message: `\nContinued Response after Tool "${toolCall.name}":\n${continuedResponse.response}`,
  //         level: 'info'
  //       });
  //     }
  //   } else if (toolResponse.response) {
  //     logger.log({ 
  //       message: `\nLLM Response:\n${toolResponse.response}`,
  //       level: 'info'
  //     });
  //   }

  //   // Multi-Step Tool Usage
  //   const multiToolPrompt = 'Find my location and then get the weather in that location.';
  //   const multiTools = [getWeatherTool];
    
  //   const multiToolResponse = await client.generateWithTools(
  //     [{ role: 'user', content: multiToolPrompt }],
  //     multiTools
  //   );
    
  //   if (multiToolResponse.toolCalls && multiToolResponse.toolCalls.length > 0) {
  //     for (const toolCall of multiToolResponse.toolCalls) {
  //       logger.log({ 
  //         message: `\nTool Called: ${toolCall.name}`,
  //         level: 'info'
  //       });
  //       logger.log({ 
  //         message: `Arguments: ${JSON.stringify(toolCall.arguments)}`,
  //         level: 'info'
  //       });
        
  //       let toolResult;
  //       if (toolCall.name === 'get_location') {
  //         toolResult = { location: 'New York, USA' };
  //       } else if (toolCall.name === 'get_weather') {
  //         toolResult = { temperature: '18°C', condition: 'Cloudy' };
  //       } else {
  //         toolResult = { error: 'Unknown tool' };
  //       }
        
  //       const continuedResponse = await client.continueWithToolResult(
  //         [{ role: 'user', content: multiToolPrompt }],
  //         multiTools,
  //         [{ name: toolCall.name, result: toolResult }]
  //       );
        
  //       logger.log({ 
  //         message: `\nContinued Response after Tool "${toolCall.name}":\n${continuedResponse.response}`,
  //         level: 'info'
  //       });
  //     }
  //   } else if (multiToolResponse.response) {
  //     logger.log({ 
  //       message: `\nLLM Response:\n${multiToolResponse.response}`,
  //       level: 'info'
  //     });
  //   }

  // } catch (error) {
  //   logger.error({ 
  //     message: 'An error occurred:', 
  //     level: 'error',
  //     error 
  //   });
  // } finally {
  //   await client.disconnect();
  //   logger.log({ 
  //     message: '\nDisconnected from MCP server.',
  //     level: 'info'
  //   });
  // }
}

main();