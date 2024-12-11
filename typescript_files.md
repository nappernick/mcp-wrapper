# TypeScript Files

## ./__tests__/ClaudeProvider.test.ts

```typescript
// __tests__/ClaudeProvider.test.ts
import { expect, test, mock, describe, beforeEach } from "bun:test";
import { ClaudeProvider } from '../src/providers/ClaudeProvider';
import { ModelMessage, ToolFunction, ToolResult } from '../src/providers/ModelProvider';

// Define mock response types
interface ClaudeTextBlock {
  type: 'text';
  text: string;
}

interface ClaudeToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}

type ClaudeContentBlock = ClaudeTextBlock | ClaudeToolUseBlock;

interface ClaudeResponse {
  content: ClaudeContentBlock[];
}

// Corrected mocks:
const mockTextResponse: ClaudeResponse = {
  content: [
    { type: 'text', text: 'The capital of France is Paris.' }
  ]
};

const mockToolResponse: ClaudeResponse = {
  content: [
    { type: 'text', text: 'Let me check the weather.' },
    {
      type: 'tool_use',
      id: 'call_123',
      name: 'get_weather',
      input: {
        location: 'San Francisco',
        unit: 'celsius'
      }
    }
  ]
};

const mockMultiToolResponse: ClaudeResponse = {
  content: [
    { type: 'text', text: 'Let me check both.' },
    {
      type: 'tool_use',
      id: 'call_124',
      name: 'get_weather',
      input: { location: 'San Francisco' }
    },
    {
      type: 'tool_use',
      id: 'call_125',
      name: 'get_time',
      input: { timezone: 'PST' }
    }
  ]
};

// Multi-turn mock
const mockMultiTurnResponse: ClaudeResponse = {
  content: [
    { type: 'text', text: 'Earlier you asked about the capital of France; it is Paris. Now, what else would you like to know?' }
  ]
};

// No tool calls, just multiple textual responses
const mockNoToolResponse: ClaudeResponse = {
  content: [
    { type: 'text', text: 'Let me think...' },
    { type: 'text', text: 'After careful thought, no tools are needed here.' }
  ]
};

// Malformed tool response: missing `name` field
const mockMalformedToolResponse: ClaudeResponse = {
  content: [
    { type: 'text', text: 'I will call a tool now.' },
    {
      type: 'tool_use',
      id: 'call_999',
      // name is missing!
      input: { key: 'value' }
    } as any 
  ]
};

// Invalid schema scenario: the model returns a field not allowed by the schema
const mockInvalidSchemaToolCall: ClaudeResponse = {
  content: [
    { type: 'text', text: 'Checking the weather...' },
    {
      type: 'tool_use',
      id: 'call_456',
      name: 'get_weather',
      input: {
        location: 'San Francisco',
        unit: 'celsius',
        extraneous_field: 'not allowed' // Not allowed by schema
      }
    }
  ]
};

// Create mock for Anthropic's message creation
const mockCreate = mock(() => mockTextResponse);
const mockAnthropicClient = {
  messages: {
    create: mockCreate
  }
};

// Mock the Anthropic constructor
mock.module('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      constructor() {
        return mockAnthropicClient;
      }
    }
  };
});

describe('ClaudeProvider', () => {
  let provider: ClaudeProvider;
  const apiKey = 'test-api-key';

  const weatherTool: ToolFunction = {
    name: 'get_weather',
    description: 'Get the weather',
    input_schema: {
      type: 'object',
      properties: {
        location: { type: 'string' },
        unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
      },
      required: ['location'],
      additionalProperties: false
    }
  };

  beforeEach(() => {
    provider = new ClaudeProvider(apiKey);
    mockCreate.mockClear();
  });

  test('initializes correctly', () => {
    expect(provider).toBeDefined();
  });

  test('generates a simple response', async () => {
    mockCreate.mockReturnValueOnce(mockTextResponse);
    const response = await provider.generateResponse('What is the capital of France?');

    expect(response).toBe('The capital of France is Paris.');
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      messages: [{ role: 'user', content: 'What is the capital of France?' }]
    }));
  });

  test('handles tool usage scenario', async () => {
    mockCreate.mockReturnValueOnce(mockToolResponse);

    const tools: ToolFunction[] = [{
      name: 'get_weather',
      description: 'Get the weather',
      input_schema: {
        type: 'object',
        properties: {
          location: { type: 'string' },
          unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
        },
        required: ['location'],
        additionalProperties: false
      }
    }];

    const result = await provider.generateWithTools(
      [{ role: 'user', content: 'What\'s the weather in San Francisco?' }],
      tools
    );

    expect(result.toolCalls).toBeDefined();
    expect(result.toolCalls?.length).toBe(1);
    expect(result.toolCalls?.[0].name).toBe('get_weather');
    expect(result.toolCalls?.[0].arguments).toEqual({
      location: 'San Francisco',
      unit: 'celsius'
    });
  });

  test('handles multiple tool calls', async () => {
    mockCreate.mockReturnValueOnce(mockMultiToolResponse);

    const tools: ToolFunction[] = [
      {
        name: 'get_weather',
        description: 'Get the weather',
        input_schema: {
          type: 'object',
          properties: { location: { type: 'string' } },
          required: ['location'],
          additionalProperties: false
        }
      },
      {
        name: 'get_time',
        description: 'Get the time',
        input_schema: {
          type: 'object',
          properties: { timezone: { type: 'string' } },
          required: ['timezone'],
          additionalProperties: false
        }
      }
    ];

    const result = await provider.generateWithTools(
      [{ role: 'user', content: 'What\'s the weather and time in San Francisco?' }],
      tools
    );

    expect(result.toolCalls).toBeDefined();
    expect(result.toolCalls?.length).toBe(2);
    expect(result.toolCalls?.[0].name).toBe('get_weather');
    expect(result.toolCalls?.[0].arguments).toEqual({ location: 'San Francisco' });
    expect(result.toolCalls?.[1].name).toBe('get_time');
    expect(result.toolCalls?.[1].arguments).toEqual({ timezone: 'PST' });
  });

  test('handles tool results correctly', async () => {
    mockCreate.mockReturnValueOnce({
      content: [
        {
          type: 'text',
          text: 'Based on the weather data, I recommend bringing an umbrella.'
        }
      ]
    });

    const messages: ModelMessage[] = [
      { role: 'user', content: 'What\'s the weather?' },
      { role: 'assistant', content: 'Let me check.' },
      { role: 'user', content: JSON.stringify({ temperature: 15, condition: 'rainy' }) }
    ];

    const toolResults: ToolResult[] = [
      {
        name: 'get_weather',
        result: { temperature: '15°C', condition: 'Rainy' },
        tool_use_id: 'call_123' // Included tool_use_id
      }
    ];

    const result = await provider.continueWithToolResult(messages, [], toolResults);
    
    expect(result.response).toBe('Based on the weather data, I recommend bringing an umbrella.');
  });

  test('multi-turn conversation', async () => {
    mockCreate.mockReturnValueOnce(mockTextResponse); // First turn
    const firstResponse = await provider.generateResponse('What is the capital of France?');
    expect(firstResponse).toBe('The capital of France is Paris.');

    // Second turn with reference to previous turn
    mockCreate.mockReturnValueOnce(mockMultiTurnResponse);
    const secondResponse = await provider.generateResponse('Thanks, and remind me of that fact again.');
    expect(secondResponse).toContain('Earlier you asked about the capital of France; it is Paris.');
  });

  test('no tool scenario with multiple text blocks', async () => {
    mockCreate.mockReturnValueOnce(mockNoToolResponse);
    const res = await provider.generateWithTools(
      [{ role: 'user', content: 'Do I need a tool?' }],
      [weatherTool]
    );

    // No tool_calls should be returned
    expect(res.toolCalls).toBeUndefined();
    expect(res.response?.replace(/\s+/g, ' ').trim())
      .toBe('Let me think... After careful thought, no tools are needed here.'.replace(/\s+/g, ' ').trim());
  });

  test('handles unexpected Anthropic client data (empty content)', async () => {
    mockCreate.mockReturnValueOnce({ content: [] });
    const res = await provider.generateResponse('Just testing empty content');
    expect(res).toBe(''); // Should return empty string if no content
  });

  test('malformed tool block gracefully handled', async () => {
    mockCreate.mockReturnValueOnce(mockMalformedToolResponse);
    const res = await provider.generateWithTools(
      [{ role: 'user', content: 'Use a tool somehow.' }],
      [weatherTool]
    );
    // Malformed means no name found, so no toolCalls should be returned:
    expect(res.toolCalls).toBeUndefined();
    expect(res.response).toBe('I will call a tool now.');
  });

  test('invalid schema - extraneous field', async () => {
    mockCreate.mockReturnValueOnce(mockInvalidSchemaToolCall);
    const res = await provider.generateWithTools(
      [{ role: 'user', content: 'Get the weather in SF in celsius' }],
      [weatherTool]
    );

    // The provider doesn't validate schema internally in this code, 
    // but if we had validation, we could test it. Here we just show 
    // that extraneous_field is still passed along.
    expect(res.toolCalls).toBeDefined();
    expect(res.toolCalls?.[0].name).toBe('get_weather');
    // The arguments will include extraneous_field since no validation in code
    expect(res.toolCalls?.[0].arguments).toHaveProperty('extraneous_field');
  });
});
```


## ./__tests__/MCPClientWrapper.test.ts

```typescript
import { expect, test, mock, describe, beforeEach } from "bun:test";
import MCPClientWrapper from '../src/mcp/MCPClient';

// We'll define the type of a readResource response to ensure consistency.
interface ResourceContentText {
  uri: string;
  mimeType?: string;
  text: string;
}

interface ResourceContentBlob {
  uri: string;
  mimeType?: string;
  blob: string;
}

type ResourceContent = ResourceContentText | ResourceContentBlob;

interface ResourceResponse {
  contents: ResourceContent[];
}

// Mock implementations with proper structure:
const mockConnect = mock(() => Promise.resolve());
const mockClose = mock(() => Promise.resolve());
const mockRequest = mock(() => Promise.resolve({
  // If this request were for something else, ensure correctness.
  // For now it's unrelated to readResource.
  contents: [{
    uri: "file:///somefile.txt",
    text: "Another test content",
    mimeType: "text/plain"
  }]
} as ResourceResponse));

const mockReadResource = mock(() => ({
  contents: [{
    uri: "file:///somefile.txt",
    text: "Test content",
    mimeType: "text/plain"
  }]
} as ResourceResponse));

const mockClient = {
  connect: mockConnect,
  close: mockClose,
  request: mockRequest,
  readResource: mockReadResource
};

// Mock the Client constructor
const MockClient = mock(() => mockClient);

// Mock the entire module
mock.module('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: MockClient
}));

describe('MCPClientWrapper', () => {
  let wrapper: MCPClientWrapper;

  beforeEach(() => {
    MockClient.mockClear();
    mockConnect.mockClear();
    mockClose.mockClear();
    mockRequest.mockClear();
    mockReadResource.mockClear();

    wrapper = new MCPClientWrapper({
      serverCommand: 'bun',
      serverPath: './someScript.js',
      serverArgs: [],
      // providerName: 'anthropic'
    });
  });

  test('reads resource', async () => {
    const uri = 'file:///somefile.txt';
    // mockReadResource already defined above returns a valid text scenario
    const content = await wrapper.readResource(uri);
    expect(content).toBe("Test content");
    expect(mockReadResource).toHaveBeenCalledWith({ uri: "file:///somefile.txt" });
  });

  test('closes connection', async () => {
    await wrapper.connect();
    await wrapper.disconnect();
    expect(mockClient.close).toHaveBeenCalled();
  });

  test('handles read resource errors', async () => {
    mockReadResource.mockImplementationOnce(() => {
      throw new Error('Failed to read resource');
    });

    await expect(wrapper.readResource('file:///nonexistent.txt'))
      .rejects
      .toThrow('Failed to read resource');
  });

  test('connect failure', async () => {
    mockConnect.mockImplementationOnce(() => Promise.reject(new Error('Connection failed')));
    await expect(wrapper.connect()).rejects.toThrow('Connection failed');
  });


  test('read blob resource', async () => {
    // Return a blob-based resource content following the schema
    mockReadResource.mockReturnValueOnce({
      contents: [{
        uri: "file:///blobdata",
        mimeType: "application/octet-stream",
        blob: Buffer.from('Hello').toString('base64')
      }]
    } as ResourceResponse);

    const content = await wrapper.readResource('file:///blobdata');
    expect(content).toBe('Hello');
  });
});

```


## ./__tests__/OpenAIProvider.test.ts

```typescript
import { expect, test, mock, describe, beforeEach } from "bun:test";
import { OpenAIProvider } from '../src/providers/OpenAIProvider';
import { ToolFunction } from '../src/providers/ModelProvider';

// Define types for the mock responses

interface OpenAIMessage {
  content?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

interface OpenAIChoice {
  message: OpenAIMessage;
}

interface OpenAIResponse {
  choices: OpenAIChoice[];
}

const mockSimpleResponse: OpenAIResponse = {
  choices: [
    { message: { content: 'Paris is the capital of France.' } }
  ]
};

const mockNoContentResponse: OpenAIResponse = {
  choices: [
    { message: { } } // no content, no function calls
  ]
};

const mockInvalidJsonToolCall: OpenAIResponse = {
  choices: [
    {
      message: {
        function_call: {
          name: 'get_weather',
          // Missing quotes around strings or invalid JSON
          arguments: '{location:San Francisco,unit:celsius}'
        }
      }
    }
  ]
};

const mockStopSequenceResponse: OpenAIResponse = {
  choices: [
    { message: { content: 'This is sensitive info STOP do not continue.' } }
  ]
};

const mockInvalidSchemaResponse: OpenAIResponse = {
  choices: [
    {
      message: {
        function_call: {
          name: 'get_weather',
          arguments: JSON.stringify({
            location: 'SF',
            unit: 'kelvin' // invalid according to the schema
          })
        }
      }
    }
  ]
};


// Mock message response for tool usage
const mockToolResponse: OpenAIResponse = {
  choices: [
    {
      message: {
        content: '',
        tool_calls: [{
          id: 'call_123',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: JSON.stringify({
              location: 'San Francisco',
              unit: 'celsius'
            })
          }
        }]
      }
    }
  ]
};

const mockCreate = mock(() => mockSimpleResponse);

const mockOpenAI = {
  chat: {
    completions: {
      create: mockCreate
    }
  }
};

mock.module('openai', () => {
  return {
    default: class MockOpenAI {
      constructor() {
        return mockOpenAI;
      }
    }
  };
});

describe('OpenAIProvider Extended Tests', () => {
  let provider: OpenAIProvider;
  const apiKey = 'test-api-key';

  const weatherTool: ToolFunction = {
    name: 'get_weather',
    description: 'Get the weather for a location',
    input_schema: {
      type: 'object',
      properties: {
        location: { type: 'string' },
        unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
      },
      required: ['location'],
      additionalProperties: false
    }
  };

  beforeEach(() => {
    provider = new OpenAIProvider(apiKey);
    mockCreate.mockClear();
  });


  test('initializes correctly', () => {
    expect(provider).toBeDefined();
  });

  test('generates a simple response', async () => {
    const response = await provider.generateResponse('What is the capital of France?');
    
    expect(response).toMatch(/(capital of France|paris)/i);

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      messages: [{role: 'user', content: 'What is the capital of France?'}]
    }));
  });

  test('handles tool usage scenario', async () => {
    mockCreate.mockImplementationOnce(() => mockToolResponse);

    const tools: ToolFunction[] = [
      {
        name: 'get_weather',
        description: 'Get the weather for a location',
        input_schema: {
          type: 'object' as const, // Fix the type literal
          properties: {
            location: { type: 'string' as const },
            unit: { 
              type: 'string' as const, 
              enum: ['celsius', 'fahrenheit'] 
            }
          },
          required: ['location'],
          additionalProperties: false
        }
      }
    ];

    const { toolCalls } = await provider.generateWithTools(
      [{role: 'user', content: 'Please use the `get_weather` function for San Francisco in celsius.'}],
      tools
    );

    expect(toolCalls).toBeDefined();
    expect(toolCalls?.[0].name).toBe('get_weather');
    expect(toolCalls?.[0].arguments).toEqual({
      location: 'San Francisco',
      unit: 'celsius'
    });
  });



  test('multi-turn conversation', async () => {
    // First turn
    mockCreate.mockReturnValueOnce(mockSimpleResponse);
    const firstRes = await provider.generateResponse('What is the capital of France?');
    expect(firstRes).toBe('Paris is the capital of France.');

    // Second turn references first turn
    mockCreate.mockReturnValueOnce({
      choices: [
        { message: { content: 'As I said, Paris is the capital of France. Anything else?' } }
      ]
    });
    const secondRes = await provider.generateResponse('Remind me what you said.');
    expect(secondRes).toBe('As I said, Paris is the capital of France. Anything else?');
  });

  test('handles no content response gracefully', async () => {
    mockCreate.mockReturnValueOnce(mockNoContentResponse);
    const res = await provider.generateResponse('Just testing');
    expect(res).toBe('');
  });

  test('handles invalid JSON in tool arguments', async () => {
    mockCreate.mockReturnValueOnce({
      choices: [
        {
          message: {
            function_call: {
              name: 'get_weather',
              arguments: '{location:San Francisco,unit:celsius}' // invalid JSON
            }
          }
        }
      ]
    });
  
    const { toolCalls } = await provider.generateWithTools(
      [{ role: 'user', content: 'Find weather in San Francisco' }],
      [weatherTool]
    );
  
    expect(toolCalls).toBeDefined();
    expect(toolCalls?.[0].name).toBe('get_weather');
    // After the try/catch, arguments should be empty object.
    expect(toolCalls?.[0].arguments).toEqual({});
  });
  

  test('respects stop sequences', async () => {
    mockCreate.mockReturnValueOnce(mockStopSequenceResponse);
    const res = await provider.generateResponse('Tell me something with stop sequence');
    expect(res).toBe('This is sensitive info STOP do not continue.');
  });

  test('invalid schema scenario', async () => {
    mockCreate.mockReturnValueOnce(mockInvalidSchemaResponse);
    const { toolCalls } = await provider.generateWithTools(
      [{ role: 'user', content: 'Get weather in SF' }],
      [weatherTool]
    );

    // The provider code doesn’t validate schema internally, so it will still 
    // return the unit 'kelvin' as is. If we wanted to test schema validation,
    // we’d implement it in the provider and test for thrown errors.
    expect(toolCalls).toBeDefined();
    expect(toolCalls?.[0].arguments.unit).toBe('kelvin');
  });
});
```


## ./index.ts

```typescript
// src/index.ts
// import { runEvaluations as runEvaluationsScript } from './src/scripts/run-evals'

import MCPClientWrapper from './src/mcp/MCPClient';
import MCPServerWrapper from './src/mcp/MCPServer';
import { ProviderFactory } from './src/providers/ProviderFactory';
import { OpenAIProvider } from './src/providers/OpenAIProvider';
import { ClaudeProvider } from './src/providers/ClaudeProvider';
import { ToolDefinitions } from './src/tools/ToolDefinitions';
import Cache from './src/utils/Cache';
import logger from './src/utils/Logger';
// import runEvals from './src/evals/EvaluationRunner';
import type { ToolDefinition } from './src/tools/ToolDefinitions';
import type {
  ModelProvider,
  ModelProviderOptions,
  JSONSchema,
  ModelMessage,
  ModelToolCall,
  ToolFunction,
  ToolResult,
} from './src/providers/ModelProvider';

export {
  MCPClientWrapper,
  MCPServerWrapper,
  ProviderFactory,
  OpenAIProvider,
  ClaudeProvider,
  ToolDefinitions,
  Cache,
  logger,
  // runEvaluationsScript,
  // runEvals
};

export type {
  ToolDefinition,
  ModelProvider,
  ModelProviderOptions,
  JSONSchema,
  ModelMessage,
  ModelToolCall,
  ToolFunction,
  ToolResult,
};
```


## ./src/config/config.ts

```typescript
// src/config/config.ts
import dotenv from 'dotenv';
import path from 'node:path';
import logger from '../utils/Logger';

dotenv.config();

// Force reload of .env file
dotenv.config({ override: true, path: path.resolve(process.cwd(), '.env') });


interface Config {
  OPENAI_API_KEY: string;
  CLAUDE_API_KEY: string;
  PROVIDER_NAME: 'openai' | 'anthropic';
  MCP_SERVER_COMMAND: string;
  MCP_SERVER_ARGS?: string[];
  CACHE_TTL: number;
  MCP_SERVER_HOST?: string;
  MCP_SERVER_PORT?: number
}

const CONFIG: Config = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  CLAUDE_API_KEY: process.env.CLAUDE_API_KEY || '',
  PROVIDER_NAME: (process.env.PROVIDER_NAME as 'openai' | 'anthropic') || 'anthropic',
  MCP_SERVER_COMMAND: process.env.MCP_SERVER_COMMAND || 'node',
  MCP_SERVER_ARGS: process.env.MCP_SERVER_ARGS ? process.env.MCP_SERVER_ARGS.split(' ') : [],
  CACHE_TTL: parseInt(process.env.CACHE_TTL || '3600'),
};

// Validate Config
if (
  (CONFIG.PROVIDER_NAME === 'openai' && !CONFIG.OPENAI_API_KEY) ||
  (CONFIG.PROVIDER_NAME === 'anthropic' && !CONFIG.CLAUDE_API_KEY)
) {
  logger.error('API keys must be set in the environment variables.');
  process.exit(1);
}

export default CONFIG;
```


## ./src/evals/EvaluationRunner.ts

```typescript
/**
 * The `runEvals` function in TypeScript initializes an evaluation process for different providers,
 * runs tests based on test cases, and provides a summary of the test results.
 */
// src/evals/EvaluationRunner.ts
// import type { ModelProviderOptions, ToolFunction } from "../providers/ModelProvider";
// import Evaluator from "./Evaluator";
// import { TestCases } from "./TestsCases";
// import { CustomerFeedbackAnalysisSchema } from "./Schemas";
// import MCPClientWrapper from "../mcp/MCPClient"
// import { ProviderFactory } from "../providers/ProviderFactory";
// import config from "../config/config";
// import Cache from "../utils/Cache";
// import logger from "../utils/Logger";
// import path from 'node:path';
// import { green, red, yellow, cyan, bold } from "colorette";

// async function runEvals() {
//   const evaluator = new Evaluator();
  // const cache = new Cache(config.CACHE_TTL);

  // // Initialize MCP Client
  // const mcpClient = new MCPClientWrapper();
  
  // const started = mcpClient.isStartedClient() && mcpClient.isStartedTransport();
  // logger.debug("Client started?", mcpClient.isStartedClient());
  // logger.debug("Transport started?", mcpClient.isStartedTransport());

  // try {
    // if (!started) {
    //   logger.info("Attempting to connect to MCP server...");
    //   await mcpClient.connect();
    //   logger.info("Successfully connected to MCP server");
    // } else {
    //   logger.info("MCP Server already started...");
    // }

    // const resourceUri = `file://${process.cwd()}/src/data/customer_feedback.txt`;
    // logger.info(`Reading from: ${resourceUri}`);

    // let customerFeedback: string | undefined = cache.get(resourceUri);

    // if (!customerFeedback) {
    //   try {
    //     customerFeedback = await mcpClient.readResource(resourceUri);
    //     cache.set(resourceUri, customerFeedback);
    //     logger.info(`Successfully read customer feedback: ${customerFeedback}`);
    //   } catch (error: any) {
    //     logger.error(`Failed to read customer feedback: ${error.message}`);
    //     throw error;
    //   }
    // }

    // let totalTests = 0;
    // let totalPassed = 0;
    // let totalFailed = 0;

    // // Run tests for both providers
    // const providersToTest = ['openai', 'anthropic'] as const;
    // for (const providerName of providersToTest) {
    //   console.log(`\n${bold(cyan(`=== Running tests for provider: ${providerName} ===`))}`);
    //   const provider = ProviderFactory.getProvider({
    //     providerName,
    //     apiKey: providerName === 'openai' ? config.OPENAI_API_KEY : config.CLAUDE_API_KEY,
    //   });
  
    //   for (const testCase of TestCases) {
    //     totalTests++;
    //     const { prompt, expected, schema, requiresTool, toolName, description } = testCase;
    //     console.log(bold(`Test: ${description} (Provider: ${providerName})\nPrompt: ${prompt}`));

    //     try {
    //       if (requiresTool) {
    //         // Use our strictly typed tools
    //         const tools: ToolFunction[] = [
    //           {
    //             name: 'get_weather',
    //             description: 'Get weather info given a place',
    //             input_schema: {
    //               type: 'object',
    //               properties: {
    //                 location: { type: 'string', description: 'City name' },
    //                 unit: { type: 'string', enum: ['celsius','fahrenheit'] }
    //               },
    //               required: ['location'],
    //               additionalProperties: false
    //             }
    //           },
    //           {
    //             name: 'calculate_sum',
    //             description: 'Calculate sum of two numbers',
            //     input_schema: {
            //       type: 'object',
            //       properties: {
            //         a: {type:'number'},
            //         b: {type:'number'}
            //       },
            //       required: ['a','b'],
            //       additionalProperties: false
            //     }
            //   },
            //   {
            //     name: 'get_location',
            //     description: 'Get user location',
            //     input_schema: {
            //       type:'object',
            //       properties:{},
            //       required: [],
            //       additionalProperties: false
            //     }
            //   }
            // ];

            // const res = await provider.generateWithTools(
            //   [{role:'user',content:prompt}],
            //   tools
            // );

            // if (res.toolCalls && res.toolCalls.length > 0) {
            //   console.log(`Tool calls made: ${JSON.stringify(res.toolCalls)}`);
            //   if (toolName && !res.toolCalls.some(tc => tc.name === toolName)) {
            //     console.log(yellow(`⚠ Expected tool "${toolName}" but got: ${JSON.stringify(res.toolCalls)}`));
            //     totalFailed++;
            //   } else {
            //     console.log(green(`✓ Correct tool used or at least a tool was used as expected.`));
            //     // If schema expected after tool result:
            //     if (schema && expected) {
            //       const toolResult: any = { result: "8" }; // For calculate_sum scenario
            //       const finalRes = await provider.continueWithToolResult(
            //         [{role:'user', content:prompt}],
            //         tools,
            //         [{name: toolName || 'unknown_function', result: toolResult}]
            //       );
            //       let finalParsed: any;
            //       try {
            //         finalParsed = JSON.parse(finalRes.response);
            //       } catch {
            //         console.log(yellow(`⚠ Final response not JSON parseable: ${finalRes.response}`));
            //         totalFailed++;
            //         continue;
            //       }
            //       const evaluation = evaluator.runEvaluation(prompt, expected, finalParsed, schema);
            //       if (evaluation.passed) {
            //         console.log(green(`✓ Evaluation passed for prompt: "${prompt}" on ${providerName}`));
            //         totalPassed++;
            //       } else {
            //         console.log(red(`✗ Evaluation failed for prompt: "${prompt}" on ${providerName}`));
            //         if (evaluation.errors) evaluation.errors.forEach(e => console.log(red('  - '+e)));
            //         totalFailed++;
            //       }
            //     } else {
            //       // No schema/expected check, assume passed
            //       totalPassed++;
            //     }
            //   }
            // } else {
            //   console.log(yellow(`⚠ No tool calls made for a requiresTool scenario: ${prompt}`));
    //           totalFailed++;
    //         }

    //       } else {
    //         // No tools required scenario
    //         const llmResponse = await mcpClient.generateResponse(prompt, {maxTokens:4000, temperature:0.0});
    //         console.log(`LLM response: ${llmResponse}`);

    //         if (typeof expected === 'string') {
    //           if (!llmResponse.includes(expected)) {
    //             console.log(yellow(`⚠ Expected substring "${expected}" not found in LLM response.`));
    //             totalFailed++;
    //           } else {
    //             console.log(green(`✓ Evaluation passed (substring found).`));
    //             totalPassed++;
    //           }
    //         } else if (expected && schema) {
    //           let parsed: any;
    //           try {
    //             const cleaned = (testCase.cleanResponse ? testCase.cleanResponse(llmResponse): llmResponse);
    //             parsed = JSON.parse(cleaned);
    //           } catch (error) {
    //             console.log(yellow(`⚠ JSON parse error for prompt ${prompt}: ${error}`));
    //             totalFailed++;
    //             continue;
    //           }
    //           const evaluation = evaluator.runEvaluation(prompt, expected, parsed, schema);
    //           if (evaluation.passed) {
    //             console.log(green(`✓ Evaluation passed for prompt: "${prompt}" on ${providerName}`));
    //             totalPassed++;
    //           } else {
    //             console.log(red(`✗ Evaluation failed for prompt: "${prompt}" on ${providerName}`));
    //             if (evaluation.errors) evaluation.errors.forEach(e => console.log(red('  - '+e)));
    //             totalFailed++;
    //           }
    //         } else {
    //           console.log(cyan(`No special checks - prompt completed.`));
    //           // If no checks, consider it a "neutral" pass scenario
    //           totalPassed++;
    //         }
    //       }
    //     } catch (error: any) {
    //       console.log(red(`✗ Failed during evaluation for prompt "${prompt}" on ${providerName}: ${error.message}`));
    //       totalFailed++;
    //     }

    //     console.log(''); // blank line for readability
    //   }
    // }
    // // After all tests complete, print a summary
    // console.log(bold(cyan(`\n=== Summary ===`)));
    // console.log(`Total tests: ${totalTests}`);
    // console.log(`${green('Passed:')} ${totalPassed}`);
//     console.log(`${red('Failed:')} ${totalFailed}`);
//     if (totalFailed === 0) {
//       console.log(green("All tests passed successfully! 🎉"));
//     } else {
//       console.log(red("Some tests failed. Check the logs above for details."));
//     }

//   } finally {
//     try {
//       await mcpClient.disconnect();
//       logger.info("Disconnected from MCP server");
//     } catch (error) {
//       logger.error("Error during disconnect:", error);
//     }
//   }
// }

// export default runEvals;

```


## ./src/evals/Evaluator.ts

```typescript
// src/evals/Evaluator.ts
import Ajv from 'ajv';
import type { JSONSchemaType } from 'ajv';
import logger from '../utils/Logger';

interface EvaluationResult {
  prompt: string;
  expected: any;
  actual: any;
  passed: boolean;
  errors?: string[];
}

class Evaluator {
  private ajv: Ajv;

  constructor() {
    this.ajv = new Ajv();
  }

  /**
   * Validates the actual response against the expected JSON schema.
   * @param schema JSON schema defining the expected format.
   * @param actual The actual response from the LLM.
   */
  validateSchema<T>(schema: JSONSchemaType<T>, actual: any): { valid: boolean; errors?: string[] } {
    const validate = this.ajv.compile(schema);
    const valid = validate(actual);
    if (!valid) {
      const errors = validate.errors?.map(err => `${err.instancePath} ${err.message}`) || [];
      return { valid: false, errors };
    }
    return { valid: true };
  }

  /**
   * Compares the actual response with the expected response.
   * @param expected The expected response.
   * @param actual The actual response.
   */
  compareResponses(expected: any, actual: any): { passed: boolean; errors?: string[] } {
    const errors: string[] = [];
    
    // Check structure matches
    if (typeof expected !== typeof actual) {
      return { passed: false, errors: [`Type mismatch: expected ${typeof expected} but got ${typeof actual}`] };
    }

    // For objects (including arrays)
    if (typeof expected === 'object') {
      // Check if all expected keys exist in actual
      for (const key of Object.keys(expected)) {
        if (!(key in actual)) {
          errors.push(`Missing key: ${key}`);
          continue;
        }

        // For arrays, check length and type of elements
        if (Array.isArray(expected[key])) {
          if (!Array.isArray(actual[key])) {
            errors.push(`${key} should be an array`);
            continue;
          }
          
          // For action_items, check that each item has required fields
          if (key === 'action_items') {
            const missingFields = actual[key].filter((item: any) => 
              !item.team || !item.task
            );
            if (missingFields.length > 0) {
              errors.push(`Some action items are missing required fields (team/task)`);
            }
          }
        }

        // For sentiment, check it's one of the allowed values
        if (key === 'sentiment') {
          const allowedValues = ['positive', 'negative', 'neutral'];
          if (!allowedValues.includes(actual[key])) {
            errors.push(`Invalid sentiment value: ${actual[key]}`);
          }
        }
      }
    }

    return {
      passed: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Runs an evaluation.
   * @param prompt The prompt sent to the LLM.
   * @param expected The expected response object.
   * @param actual The actual LLM response.
   * @param schema Optional JSON schema for format validation.
   */
  runEvaluation(prompt: string, expected: any, actual: any, schema?: object): EvaluationResult {
    let passed = true;
    const errors: string[] = [];

    if (schema) {
      const validation = this.validateSchema(schema as JSONSchemaType<any>, actual);
      if (!validation.valid) {
        passed = false;
        errors.push(...(validation.errors || []));
      }
    }

    // Compare responses
    const comparison = this.compareResponses(expected, actual);
    if (!comparison.passed) {
      passed = false;
      errors.push(...(comparison.errors || []));
    }

    return {
      prompt,
      expected,
      actual,
      passed,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}

export default Evaluator;
export type { EvaluationResult };
```


## ./src/evals/Schemas.ts

```typescript
// src/evals/Schemas.ts
import type { JSONSchemaType } from 'ajv';

interface CustomerFeedbackAnalysis {
  sentiment: 'positive' | 'negative' | 'neutral';
  key_issues: string[];
  action_items: {
    team: string;
    task: string;
  }[];
}

const CustomerFeedbackAnalysisSchema: JSONSchemaType<CustomerFeedbackAnalysis> = {
  type: 'object',
  properties: {
    sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
    key_issues: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
    },
    action_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          team: { type: 'string' },
          task: { type: 'string' },
        },
        required: ['team', 'task'],
        additionalProperties: false,
      },
      minItems: 1,
    },
  },
  required: ['sentiment', 'key_issues', 'action_items'],
  additionalProperties: false,
};

export { CustomerFeedbackAnalysisSchema };
export type { CustomerFeedbackAnalysis };
```


## ./src/evals/TestsCases.ts

```typescript
import { JSONSchemaType } from 'ajv';

interface TestCase {
  description: string;
  prompt: string;
  expected?: any;
  schema?: object;
  cleanResponse?: (response: string) => string;
  requiresTool?: boolean;
  toolName?: string;
}

function cleanJsonResponse(response: string): string {
  return response.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
}

interface SimpleToolOutput {
  result: string;
}
const SimpleToolOutputSchema: JSONSchemaType<SimpleToolOutput> = {
  type: 'object',
  properties: {
    result: { type: 'string' }
  },
  required: ['result'],
  additionalProperties: false,
};

const TestCases: TestCase[] = [
  {
    description: "Normal Q&A with no tool usage",
    prompt: "What is the capital of France?",
    expected: "Paris", 
  },
  {
    description: "JSON analysis scenario",
    prompt: JSON.stringify({
      instruction: "You're a Customer Insights AI. Analyze this feedback and output in JSON format with keys: 'sentiment', 'key_issues', and 'action_items'.",
      feedback: "I've been a loyal user for 3 years..."
    }),
    expected: {
      sentiment: 'negative',
      key_issues: ["Poor UI/UX", "Difficulty finding basic features","pricing"],
    },
    cleanResponse: cleanJsonResponse,
  },
  {
    description: "Tool usage scenario: ask for weather",
    prompt: "Please use the `get_weather` function to find the weather in San Francisco in celsius.",
    requiresTool: true,
    toolName: 'get_weather',
  },
  {
    description: "Ambiguous scenario needing location",
    prompt: "What's the weather?",
    requiresTool: true,
    toolName: 'get_location',
  },
  {
    description: "Tool output JSON check (calculate_sum)",
    prompt: "Use the `calculate_sum` tool to add 3 and 5, then return JSON {\"result\":\"<sum>\"}",
    requiresTool: true,
    toolName: 'calculate_sum',
    schema: SimpleToolOutputSchema,
  },
  {
    description: "Multi-tool scenario (location then weather)",
    prompt: "Find my location and then get the weather in that location.",
    requiresTool: true,
    toolName: 'get_location',
  },
];

export { TestCases, cleanJsonResponse };
export type { TestCase };

```


## ./src/exampleApp.ts

```typescript
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
```


## ./src/http-wrapper.ts

```typescript
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
```


## ./src/index.ts

```typescript
// src/index.ts
import MCPClientWrapper from './mcp/MCPClient';
import MCPServerWrapper from './mcp/MCPServer';

export { MCPClientWrapper };
export { MCPServerWrapper };

// export { createServer } from './createServer'

export { ProviderFactory } from './providers/ProviderFactory';
export { OpenAIProvider } from './providers/OpenAIProvider';
export { ClaudeProvider } from './providers/ClaudeProvider';
export { ToolDefinitions } from './tools/ToolDefinitions';

// export { runEvaluations } from './scripts/run-evals'


export { default as Cache } from './utils/Cache';
export { default as logger } from './utils/Logger';
// export { default as runEvals } from './evals/EvaluationRunner';

export type { ToolDefinition } from './tools/ToolDefinitions'
export type { ModelProvider } from './providers/ModelProvider';


```


## ./src/mcp/MCPClient.ts

```typescript
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
```


## ./src/mcp/MCPServer.ts

```typescript
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
```


## ./src/providers/ClaudeProvider.ts

```typescript
// mcp-wrapper/src/providers/ClaudeProvider.ts

import { ModelProvider, ModelProviderOptions, ToolFunction, ModelMessage, ModelToolCall, ToolResult } from './ModelProvider';
import Anthropic from '@anthropic-ai/sdk';
import logger from '../utils/Logger';

interface AnthropicToolResultBlock {
  type: 'tool_result';
  content: string;
  tool_call_id: string;
}

type ClaudeToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

type ClaudeContent = {
  type: 'text' | 'tool_calls';
  text?: string;
  tool_calls?: ClaudeToolCall[];
};

type ClaudeTextBlock = {
  type: 'text';
  text: string;
}

type ClaudeToolBlock = {
  type: 'text';
  tool_calls: ClaudeToolCall[];
}

export class ClaudeProvider implements ModelProvider {
  private client: Anthropic;
  private model = 'claude-3-sonnet-20240229';

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
    logger.info('ClaudeProvider initialized.');
  }

  private conversationHistory: ModelMessage[] = [];

  private convertToAnthropicTools(tools: ToolFunction[]): any[] {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object',
        properties: tool.input_schema.properties,
        required: tool.input_schema.required || []
      }
    }));
  }

  private convertToAnthropicMessages(messages: ModelMessage[]): any[] {
    return messages.map(msg => ({
      role: msg.role === 'system' ? 'user' : msg.role,
      content: msg.content
    }));
  }

  async generateResponse(prompt: string, options: ModelProviderOptions = {}): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0.7,
      });

      // Handle the content block correctly using type predicates
      const textBlocks = response.content.filter((block): block is ClaudeTextBlock => 
        block.type === 'text'
      );
      
      return textBlocks.map(block => block.text).join(' ').trim();
    } catch (error: any) {
      logger.error('Failed to generate response:', error);
      throw error;
    }
  }

  async generateWithTools(
    messages: ModelMessage[],
    tools: ToolFunction[],
    options: ModelProviderOptions = {}
  ): Promise<{ response?: string; toolCalls?: ModelToolCall[] }> {
    try {
      logger.info('Generating response with Claude (with tools)...');

      const response = await this.client.messages.create({
        model: this.model,
        messages: this.convertToAnthropicMessages(messages),
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0.7,
        tools: this.convertToAnthropicTools(tools),
      });

      // Handle tool calls if present
      const toolUseBlocks = response.content.filter(
        (block: any) => block.type === 'tool_use'
      );

      logger.warn(`\n\n\n\n\n\nTOOL USE BLOCKS: ${toolUseBlocks}`);

      // Get text content from response
      const textContent = response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join(' ')
        .trim();

      if (toolUseBlocks.length > 0) {
        const toolCalls = toolUseBlocks.map((block: any) => ({
          id: block.id,
          name: block.name,
          arguments: block.input
        })).filter(call => call.name); // Only include calls with valid names

        // If we have valid tool calls, return them
        if (toolCalls.length > 0) {
          return { toolCalls };
        }
      }

      // Return text response if no valid tool calls
      return { response: textContent || 'I will call a tool now.' };
    } catch (error) {
      logger.error(`Failed to generate with tools: ${error}`);
      throw error;
    }
  }

  async continueWithToolResult(
    messages: ModelMessage[],
    tools: ToolFunction[],
    toolResults: ToolResult[],
    options: ModelProviderOptions = {}
  ): Promise<{ response: string }> {
    try {
      logger.info('Continuing with tool result (Claude)...');

      // Update conversation history
      if (this.conversationHistory.length === 0) {
        this.conversationHistory = [...messages];
      }

      // Add tool results to conversation as JSON strings
      toolResults.forEach((result) => {
        const toolResultContent = JSON.stringify({
          type: 'tool_result',
          tool_use_id: 'id' in result ? result.id : '9999',
          content: typeof result.result === 'string' ? result.result : JSON.stringify(result.result)
        });

        this.conversationHistory.push({
          role: 'user',
          content: toolResultContent
        });
      });

      logger.info('\n\nMessages being sent to Claude:')

      logger.warn(
        JSON.stringify(this.conversationHistory, null, 2));

      const response = await this.client.messages.create({
        model: this.model,
        messages: this.convertToAnthropicMessages(this.conversationHistory),
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0.7,
        tools: this.convertToAnthropicTools(tools),
      });

      // Add Claude's response to history
      const textContent = response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join(' ')
        .trim();

      if (textContent) {
        this.conversationHistory.push({
          role: 'assistant',
          content: textContent
        });
      }

      return { response: textContent };
    } catch (error) {
      logger.error(`Failed to continue with tool result: ${error}`);
      throw error;
    }
  }

  async executeTool(name: string, args: Record<string, any>): Promise<any> {
    // we need to implement
  }
}
```


## ./src/providers/ModelProvider.ts

```typescript
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
  input_schema: any;
}

export interface ModelMessage {
  role: 'user' | 'assistant' | 'system' | 'function';
  content?: string;
  name?: string;
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
  generateResponse(
    prompt: string,
    options?: ModelProviderOptions
  ): Promise<string>;

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
```


## ./src/providers/OpenAIProvider.ts

```typescript
// mcp-wrapper/src/providers/OpenAIProvider.ts
import type { ModelProvider, ModelProviderOptions, ToolFunction, ModelMessage, ModelToolCall, ToolResult } from './ModelProvider';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/index'
import logger from '../utils/Logger';

function toOpenAIFunction(t: ToolFunction): OpenAI.Chat.Completions.ChatCompletionTool {
  // No `strict: null` or extra fields, just a clean parameters schema
  return {
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as unknown as Record<string, unknown>,
    },
  };
}

export class OpenAIProvider implements ModelProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
    logger.info('OpenAIProvider initialized.');
  }

  async generateResponse(prompt: string, options: ModelProviderOptions = {}): Promise<string> {
    logger.info('Generating response with OpenAI (no tools).', { prompt, options });
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens ?? 4000,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 1.0,
      stop: options.stopSequences,
    });
    const content = response.choices[0]?.message?.content?.trim() || '';
    return content;
  }

  async generateWithTools(
    messages: ModelMessage[],
    tools: ToolFunction[],
    options: ModelProviderOptions = {}
  ): Promise<{ response?: string; toolCalls?: ModelToolCall[] }> {
    logger.info('Generating response with OpenAI (with tools)...');

    const openaiMessages: ChatCompletionMessageParam[] = messages.map(m => {
      if (m.role === 'function') {
        return {
          role: 'function',
          name: 'unknown_function',
          content: m.content || ''  // ensure content is never null
        };
      // @ts-expect-error
      } else if (m.role === 'tool') {
        return {
          role: 'function',
          name: (m as any).functionName || 'unknown_function',
          content: m.content || ''  // ensure content is never null
        };
      } else {
        return {
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content || ''  // ensure content is never null
        };
      }
    });
  
    const functions = tools.map(toOpenAIFunction);

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages: openaiMessages,
      max_tokens: options.maxTokens ?? 1000,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 1.0,
      stop: options.stopSequences,
      // Provide the functions as `tools`
      tools: functions,
      // Allow the model to automatically decide if/when to call a function:
      tool_choice: 'auto',
    });

    const choice = response.choices[0];

    let toolCalls: ModelToolCall[] | undefined;
    const content = choice.message?.content?.trim() || '';

    // Check for newer style `tool_calls`
    if (choice.message?.tool_calls && choice.message.tool_calls.length > 0) {
      toolCalls = choice.message.tool_calls.map(tc => {
        const fnName = tc.function.name;
        const args = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        return { name: fnName, arguments: args };
      });
      return { toolCalls };
    }

    // Check for old-style `function_call`
    const fc = choice.message?.function_call;
    if (fc) {
      let args = {};
      if (fc.arguments) {
        try {
          args = JSON.parse(fc.arguments);
        } catch {
          // If JSON parsing fails, default to empty object
          args = {};
        }
      }
      toolCalls = [{ name: fc.name!, arguments: args }];
      return { toolCalls };
    }

    // No tools called, just return the response
    return { response: content };
  }

  async continueWithToolResult(
    messages: ModelMessage[],
    tools: ToolFunction[],
    toolResults: ToolResult[],
    options: ModelProviderOptions = {}
  ): Promise<{ response: string }> {
    logger.info('Continuing with tool result (OpenAI)...');

    const openaiMessages = messages.map(m => {
      if (m.role === 'function') {
        return {
          role: 'function' as const,
          name: (m as any).functionName || 'unknown_function',
          content: m.content,
        };
      }
      // @ts-expect-error
      if (m.role === 'tool') {
        return {
          role: 'function' as const,
          name: 'unknown_function',
          content: m.content
        };
      }
      return {
        role: m.role as 'system'|'user'|'assistant',
        content: m.content
      };
    });

    const functionMessages = toolResults.map(tr => ({
      role: 'function' as const,
      name: tr.name,
      content: JSON.stringify(tr.result),
    }));

    const finalMessages = [...openaiMessages, ...functionMessages];

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages: finalMessages as ChatCompletionMessageParam[],
      max_tokens: options.maxTokens ?? 1000,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 1.0,
      stop: options.stopSequences,
    });

    const content = response.choices[0]?.message?.content?.trim() || '';
    return { response: content };
  }
}
```


## ./src/providers/ProviderFactory.ts

```typescript
// mcp-wrapper/src/providers/ProviderFactory.ts
import type { ModelProvider } from './ModelProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { ClaudeProvider } from './ClaudeProvider';
import logger from '../utils/Logger';

interface ProviderConfig {
  providerName: 'anthropic' | 'openai';
  apiKey: string;
}

export class ProviderFactory {
  static getProvider(config: ProviderConfig): ModelProvider {
    const { providerName, apiKey } = config;
    logger.debug(`Config: ${providerName} & ${apiKey}}`)
    switch (providerName) {
      case 'openai':
        logger.info('Using OpenAI Provider.');
        return new OpenAIProvider(apiKey);
      case 'anthropic':
        logger.info('Using Anthropic Provider.');
        return new ClaudeProvider(apiKey);
      default:
        const supported = `'openai' or 'anthropic'`;
        const errorMsg = `Unsupported provider: "${providerName}". Supported providers are: ${supported}.`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
    }
  }
}

```


## ./src/scripts/run-evals.ts

```typescript
#!/usr/bin/env bun
// import path from 'node:path';
// import runEvals from '../evals/EvaluationRunner';
// import config from '../config/config';


// export async function runEvaluations() {
//   console.log('Current directory:', process.cwd());
//   console.log('Script path:', path.join(__dirname, 'run-evals.ts'));
  
  // // Debug MCP configuration
  // console.log('MCP Server Command:', config.MCP_SERVER_COMMAND);
  // console.log('MCP Server Args:', config.MCP_SERVER_ARGS);
  // try {
  //   await runEvals();
  // } catch (error) {
//     console.error('Evaluation failed:', error);
//     process.exit(1);
//   }
// }

// runEvaluations();

```


## ./src/tools/TestTools.ts

```typescript
// src/tools/TestTools.ts
import { ToolFunction, JSONSchema } from '../providers/ModelProvider';

const getWeatherToolSchema: JSONSchema = {
  type: 'object',
  properties: {
    location: {
      type: 'string',
      description: 'The city and state, e.g. San Francisco, CA',
    },
    unit: {
      type: 'string',
      enum: ['celsius', 'fahrenheit'],
      description: 'The unit of temperature, either "celsius" or "fahrenheit"',
    },
  },
  required: ['location'],
  additionalProperties: false,
};

const calculateSumToolSchema: JSONSchema = {
  type: 'object',
  properties: {
    a: { type: 'number', description: 'First number' },
    b: { type: 'number', description: 'Second number' },
  },
  required: ['a', 'b'],
  additionalProperties: false,
};

export const getWeatherTool: ToolFunction = {
  name: 'get_weather',
  description: 'Get the current weather in a given location',
  input_schema: getWeatherToolSchema,
};

export const calculateSumTool: ToolFunction = {
  name: 'calculate_sum',
  description: 'Calculate the sum of two numbers',
  input_schema: calculateSumToolSchema,
};

export const AllTestTools: ToolFunction[] = [getWeatherTool, calculateSumTool];

```


## ./src/tools/ToolDefinitions.ts

```typescript
// src/tools/ToolDefinitions.ts
export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: object;
}

// Example Tool Definitions
export const ToolDefinitions: ToolDefinition[] = [
{
    name: 'calculate_sum',
    description: 'Add two numbers together.',
    inputSchema: {
    type: 'object',
    properties: {
        a: { type: 'number', description: 'First number.' },
        b: { type: 'number', description: 'Second number.' },
    },
    required: ['a', 'b'],
    },
},
{
    name: 'get_weather',
    description: 'Get the current weather for a specified location.',
    inputSchema: {
    type: 'object',
    properties: {
        location: { type: 'string', description: 'City and country, e.g., "London, UK".' },
    },
    required: ['location'],
    },
},
];
```


## ./src/utils/Cache.ts

```typescript
// src/utils/Cache.ts
import NodeCache from 'node-cache';
import logger from './Logger';

class Cache {
  private cache: NodeCache;

  constructor(ttlSeconds: number) {
    this.cache = new NodeCache({ stdTTL: ttlSeconds, checkperiod: ttlSeconds * 0.2, useClones: false });
  }

  get<T>(key: string): T | undefined {
    const value = this.cache.get<T>(key);
    if (value) {
      logger.info(`Cache hit for key: ${key}`);
    } else {
      logger.info(`Cache miss for key: ${key}`);
    }
    return value;
  }

  set<T>(key: string, value: T): void {
    this.cache.set(key, value);
    logger.info(`Cache set for key: ${key}`);
  }
}

export default Cache;
```


## ./src/utils/Logger.ts

```typescript
// logger.ts

import { createLogger, format, transports, Logger as WinstonLogger } from 'winston';

// Define the ILogger interface for typing purposes
export interface ILogger {
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
}

// Implement your actual server logging function
async function sendLogToServer(logEntry: {
  level: string;
  message: string;
  timestamp: string;
  data?: any;
}): Promise<void> {
  // Ensure this function does not use the same logger instance to prevent recursion
  try {
    // Replace with your actual server endpoint and logic
    await fetch('https://your-server.com/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(logEntry),
    });
  } catch (error) {
    // Use console.error directly to avoid recursion
    console.error('Error sending log to server:', error);
  }
}

// Logger class that implements the singleton pattern
export class Logger implements ILogger {
  private static instance: Logger;
  private winstonLogger: WinstonLogger;
  private isSendingLog: boolean = false;

  private constructor() {
    this.winstonLogger = createLogger({
      level: 'debug', // Set your desired log level
      format: format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.splat(),
        format.json()
      ),
      transports: [
        new transports.Console(),
        // Add other transports if needed (e.g., file transport)
      ],
    });
  }

  // Static method to get the singleton instance
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  // Private method to send logs to the server without causing recursion
  private async sendLogToClient(level: string, message: string, meta?: any): Promise<void> {
    if (this.isSendingLog) {
      // Prevent recursion
      return;
    }
    this.isSendingLog = true;

    try {
      await sendLogToServer({
        level,
        message,
        timestamp: new Date().toISOString(),
        data: meta,
      });
    } catch (error) {
      // Use console.error directly to avoid recursion
      console.error('Failed to send log to server:', error);
    } finally {
      this.isSendingLog = false;
    }
  }

  // Logging methods that log to both Winston and the server
  public debug(message: string, meta?: any): void {
    this.winstonLogger.debug(message, meta);
    void this.sendLogToClient('debug', message, meta);
  }

  public info(message: string, meta?: any): void {
    this.winstonLogger.info(message, meta);
    void this.sendLogToClient('info', message, meta);
  }

  public warn(message: string, meta?: any): void {
    this.winstonLogger.warn(message, meta);
    void this.sendLogToClient('warn', message, meta);
  }

  public error(message: string, meta?: any): void {
    this.winstonLogger.error(message, meta);
    void this.sendLogToClient('error', message, meta);
  }
}

// Export the singleton logger instance
const logger = Logger.getInstance();
export default logger;
```

