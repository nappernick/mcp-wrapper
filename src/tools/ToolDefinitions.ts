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