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
