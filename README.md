# MCP Wrapper

A TypeScript implementation with Model Context Protocol (MCP) that provides a unified interface for OpenAI and Anthropic LLM APIs, with built-in evaluation capabilities. The intended implementation is not actually as a git package, or with a package manager, but as a local bun linked package. The use-case is a wrapper to use Cloude or OpenAI models seamlessly, with tool calling, and a loose backbone of MCP.

I can't say it's all that extensible to other providers, but this should provide a solid foundation to branch off of & do that with.

## Features

- Unified API for both OpenAI (GPT 4o) and Anthropic (Sonnet 3.5) models
- Standardized tool calling interface
- Built-in evaluation framework
- Resource caching
- Structured logging
- Automatic JSON response handling

## Installation

```bash
# Clone the repository
git clone https://github.com/nappernick/mcp-wrapper.git
cd mcp-wrapper

# Install dependencies
bun install

# Set up environment variables
cp .env.example .env
```

## Configuration

Create a `.env` file with the following variables:

```env
OPENAI_API_KEY=your_openai_key
CLAUDE_API_KEY=your_claude_key
PROVIDER_NAME=openai|anthropic
CACHE_TTL=3600
```

## Usage

### Basic Usage

```typescript
import { MCPClientWrapper, ProviderFactory } from './src';

const client = new MCPClientWrapper({
  serverCommand: 'bun',
  serverPath: './src/scripts/start-server.ts'
});

await client.connect();
const response = await client.generateResponse('What is the capital of France?');
```

### Tool Usage

```typescript
const tools = [{
  name: 'get_weather',
  description: 'Get weather information for a specified location.',
  input_schema: {
    type: 'object',
    properties: {
      location: { type: 'string' },
      unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
    },
    required: ['location']
  }
}];

const response = await provider.generateWithTools(
  [{ role: 'user', content: 'What\'s the weather in London?' }],
  tools
);
```

#### Use in Project
```
bun build
bun link mcp-wrapper
```

### Running Evaluations

```bash
# Run the evaluation suite
bun run src/scripts/start-server.ts &     
sleep 3
bun run src/scripts/run-evals.ts
```

## Project Structure

```
src/
├── config/         # Configuration management
├── evals/         # Evaluation framework
├── mcp/           # MCP client and server implementation
├── providers/     # LLM provider implementations
├── scripts/       # CLI scripts
├── tools/         # Tool definitions
└── utils/         # Utility functions
```

## Testing

The project includes a comprehensive evaluation framework in `src/evals/` that tests:

- Basic Q&A capabilities
- JSON response formatting
- Tool usage scenarios
- Multi-step reasoning
- Error handling

## API Reference

### MCPClientWrapper

```typescript
class MCPClientWrapper {
  constructor(config: MCPClientConfig);
  connect(): Promise<void>;
  generateResponse(prompt: string, options?: ModelProviderOptions): Promise<string>;
  disconnect(): Promise<void>;
}
```

### ModelProvider

```typescript
interface ModelProvider {
  generateResponse(prompt: string, options?: ModelProviderOptions): Promise<string>;
  generateWithTools(messages: ModelMessage[], tools: ToolFunction[]): Promise<{
    response?: string;
    toolCalls?: ModelToolCall[];
  }>;
  continueWithToolResult(messages: ModelMessage[], tools: ToolFunction[], 
    toolResults: ToolResult[]): Promise<{ response: string }>;
}
```

## Contributing

Please see our contributing guidelines for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the LICENSE file for details.