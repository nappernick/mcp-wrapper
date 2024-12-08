import { MCPClientWrapper, ProviderFactory } from './index';
import { getWeatherTool, calculateSumTool } from './tools/TestTools';
import config from './config/config';

async function main() {
  // Initialize MCP Client
  const client = new MCPClientWrapper({
    serverCommand: config.MCP_SERVER_COMMAND,
    serverPath: './dist/scripts/start-server.js', // Ensure to use the compiled path
    serverArgs: config.MCP_SERVER_ARGS,
    providerName: config.PROVIDER_NAME
  });

  try {
    // Connect to the MCP server
    await client.connect();
    console.log('Connected to MCP server.');

    // === Basic Usage ===
    const basicPrompt = 'What is the capital of France?';
    const basicResponse = await client.generateResponse(basicPrompt);
    console.log(`\nBasic Response:\nPrompt: "${basicPrompt}"\nResponse: "${basicResponse}"`);

    // === Tool Usage ===
    const weatherPrompt = 'Please use the `get_weather` function to find the weather in San Francisco in celsius.';
    
    const tools = [getWeatherTool];
    
  const toolResponse = await client.generateWithTools(
    [{ role: 'user', content: weatherPrompt }],
    tools
  );

  if (toolResponse.toolCalls && toolResponse.toolCalls.length > 0) {
    for (const toolCall of toolResponse.toolCalls) {
      console.log(`\nTool Called: ${toolCall.name}`);
      console.log('Arguments:', toolCall.arguments);
      
      // Execute the tool based on its name
      let toolResult;
      if (toolCall.name === 'get_weather') {
        // Mocked response
        toolResult = { temperature: '20°C', condition: 'Sunny' };
      } else if (toolCall.name === 'calculate_sum') {
        const { a, b } = toolCall.arguments;
        toolResult = { result: a + b };
      } else {
        toolResult = { error: 'Unknown tool' };
      }
      
      // Continue the interaction with the tool result
      const continuedResponse = await client.continueWithToolResult(
        [{ role: 'user', content: weatherPrompt }],
        tools,
        [{ name: toolCall.name, result: toolResult, tool_use_id: ("tool_use_id" in toolCall ? toolCall.tool_use_id : '666') as string }] // Adjusted to include tool_use_id
      );
      
      console.log(`\nContinued Response after Tool "${toolCall.name}":\n${continuedResponse.response}`);
    }
  } else if (toolResponse.response) {
    console.log(`\nLLM Response:\n${toolResponse.response}`);
  }

    // === Multi-Step Tool Usage ===
    const multiToolPrompt = 'Find my location and then get the weather in that location.';
    const multiTools = [getWeatherTool];
    
    const multiToolResponse = await client.generateWithTools(
      [{ role: 'user', content: multiToolPrompt }],
      multiTools
    );
    
    if (multiToolResponse.toolCalls && multiToolResponse.toolCalls.length > 0) {
      for (const toolCall of multiToolResponse.toolCalls) {
        console.log(`\nTool Called: ${toolCall.name}`);
        console.log('Arguments:', toolCall.arguments);
        
        // Execute the tool based on its name
        let toolResult;
        if (toolCall.name === 'get_location') {
          // Mock location data
          toolResult = { location: 'New York, USA' };
        } else if (toolCall.name === 'get_weather') {
          toolResult = { temperature: '18°C', condition: 'Cloudy' };
        } else {
          toolResult = { error: 'Unknown tool' };
        }
        
        // Continue the interaction with the tool result
        const continuedResponse = await client.continueWithToolResult(
          [{ role: 'user', content: multiToolPrompt }],
          multiTools,
          [{ name: toolCall.name, result: toolResult }]
        );
        
        console.log(`\nContinued Response after Tool "${toolCall.name}":\n${continuedResponse.response}`);
      }
    } else if (multiToolResponse.response) {
      console.log(`\nLLM Response:\n${multiToolResponse.response}`);
    }

  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    // Disconnect the client
    await client.disconnect();
    console.log('\nDisconnected from MCP server.');
  }
}

main();