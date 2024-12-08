# MCP Wrapper

![NPM Version](https://img.shields.io/npm/v/%40modelcontextprotocol%2Fwrapper)

A TypeScript wrapper adhering to the **Model Context Protocol (MCP)**, enabling seamless integration with both **OpenAI's GPT-4** and **Anthropic's Claude** APIs. This wrapper provides a unified programmatic interface, allowing easy switching between model providers while leveraging MCP for context management, tool calling, JSON mode, and caching.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
  - [Running the Example Application](#running-the-example-application)
  - [Running Evaluations](#running-evaluations)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [Logging and Tracing](#logging-and-tracing)
- [Contributing](#contributing)
- [License](#license)

## Overview

The **Model Context Protocol (MCP)** allows applications to provide context for LLMs in a standardized way, separating the concerns of providing context from the actual LLM interaction. This wrapper leverages MCP to manage resources, prompts, and tools, enabling enhanced interactions with language models.

## Installation

1. **Clone the Repository**

   ```bash
   git clone https://github.com/yourusername/mcp-wrapper.git
   cd mcp-wrapper