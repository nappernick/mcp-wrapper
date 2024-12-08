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
