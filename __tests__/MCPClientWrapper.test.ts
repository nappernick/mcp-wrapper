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
      providerName: 'anthropic'
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
