import { expect, test, mock, describe, beforeEach } from "bun:test";
import { OpenAIProvider } from '../src/providers/OpenAIProvider';
import { ToolFunction } from '../src/providers/ModelProvider';
import OpenAI from 'openai';

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