// src/evals/TestCases.ts
import { JSONSchemaType } from 'ajv';

interface TestCase {
  description: string;
  prompt: string;
  expected?: any;
  schema?: object;
  cleanResponse?: (response: string) => string;
  requiresTool?: boolean;
  toolName?: string; // name of the tool we expect the model to call
  // For tool tests: We'll first try generateWithTools. If requiresTool is true
  // and no tool call is returned, that's a fail.
  // For normal Q&A: Just check substring in final response.
  // For JSON tasks: Parse and validate against schema or partial checks.
}

function cleanJsonResponse(response: string): string {
  return response.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
}

// Example schema for a simple tool output scenario
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
    description: "Normal Q&A with no tool usage - Checking if response mentions 'Paris'",
    prompt: "What is the capital of France?",
    expected: "Paris" // We'll just check if the substring 'Paris' is in the response
  },
  {
    description: "JSON analysis scenario - Customer Insights",
    prompt: JSON.stringify({
      instruction: "You're a Customer Insights AI. Analyze this feedback and output in JSON format with keys: 'sentiment', 'key_issues', and 'action_items'.",
      feedback: "I've been a loyal user for 3 years, but the recent UI update is a disaster..."
    }),
    expected: {
      sentiment: 'negative',
      // We won't strictly check all keys in `key_issues`, just ensure it's an array with strings and sentiment matches
      // The schema or partial checks done by evaluator can confirm structure.
    },
    schema: {}, // Use schema if we have one, or rely on partial checks in evaluator
    cleanResponse: cleanJsonResponse,
  },
  {
    description: "Tool usage scenario: weather query requiring get_weather tool",
    prompt: "Please use the `get_weather` function to find the weather in San Francisco in celsius.",
    requiresTool: true,
    toolName: 'get_weather',
    // We expect a tool call to 'get_weather' with arguments { location: "San Francisco", unit: "celsius" } ideally
    // The evaluator can check if toolCalls returned from generateWithTools includes this toolName.
  },
  {
    description: "Ambiguous weather scenario with no location - expecting either clarification or a tool call",
    prompt: "What's the weather?",
    requiresTool: true,
    toolName: 'get_weather',
    // If the model can't call the tool due to missing location, it might ask for location.
    // The evaluator can fail if no tool call is made (since we required it).
  },
  {
    description: "Tool output JSON check with schema validation (calculate_sum)",
    prompt: "Use the `calculate_sum` tool to add 3 and 5, then return JSON in the format {\"result\": \"<sum>\"}",
    requiresTool: true,
    toolName: 'calculate_sum',
    schema: SimpleToolOutputSchema,
    // After tool call, we'll run continueWithToolResult with a simulated tool result like {result:"8"}.
    // Then check final JSON matches schema.
  }
];

export { TestCases, cleanJsonResponse };
export type { TestCase };
