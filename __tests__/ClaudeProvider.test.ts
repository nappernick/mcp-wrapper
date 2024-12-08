// __tests__/ClaudeProvider.test.ts
import { expect, test, mock, describe, beforeEach } from "bun:test";
import { ClaudeProvider } from '../src/providers/ClaudeProvider';
import { ModelMessage, ToolFunction } from '../src/providers/ModelProvider';
import Anthropic from '@anthropic-ai/sdk';

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
    } as unknown as ClaudeToolUseBlock // forcing a bad structure
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
      { role: 'function', content: JSON.stringify({ temperature: 15, condition: 'rainy' }) }
    ];

    const result = await provider.continueWithToolResult(messages, [], []);
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
    expect(res.response).toBe('Let me think...After careful thought, no tools are needed here.');
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
