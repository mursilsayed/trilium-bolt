#!/usr/bin/env node

/**
 * trilium-bolt - Lightning-fast MCP server for Trilium Notes — search, create, update, and organize your notes with AI
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TriliumClient } from './trilium-client.js';
import {
  searchNotesSchema,
  searchNotes,
} from './tools/search.js';
import {
  getNoteSchema,
  getNote,
  getNoteTreeSchema,
  getNoteTree,
} from './tools/get.js';
import {
  createNoteSchema,
  createNote,
  updateNoteSchema,
  updateNote,
  deleteNoteSchema,
  deleteNote,
} from './tools/write.js';

// Create the MCP server
const server = new McpServer({
  name: 'trilium-bolt',
  version: '1.0.0',
});

// Initialize Trilium client (lazily, on first tool use)
let client: TriliumClient | null = null;

function getClient(): TriliumClient {
  if (!client) {
    client = new TriliumClient();
  }
  return client;
}

// Register tools
server.tool(
  'search_notes',
  'Search for notes in Trilium using full-text search or attribute queries',
  searchNotesSchema.shape,
  async (args) => {
    try {
      const result = await searchNotes(getClient(), searchNotesSchema.parse(args));
      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  }
);

server.tool(
  'get_note',
  'Get a note by ID, including its content and metadata. Text note content is returned as markdown for easier reading and processing.',
  getNoteSchema.shape,
  async (args) => {
    try {
      const result = await getNote(getClient(), getNoteSchema.parse(args));
      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  }
);

server.tool(
  'get_note_tree',
  'Get the children/hierarchy of a note',
  getNoteTreeSchema.shape,
  async (args) => {
    try {
      const result = await getNoteTree(getClient(), getNoteTreeSchema.parse(args));
      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  }
);

server.tool(
  'create_note',
  'Create a new note in Trilium. Content can be provided as markdown (default) or HTML via the contentFormat parameter.',
  createNoteSchema.shape,
  async (args) => {
    try {
      const result = await createNote(getClient(), createNoteSchema.parse(args));
      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  }
);

server.tool(
  'update_note',
  'Update a note\'s title and/or content. Content can be provided as markdown (default) or HTML via the contentFormat parameter.',
  updateNoteSchema.shape,
  async (args) => {
    try {
      const result = await updateNote(getClient(), updateNoteSchema.parse(args));
      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  }
);

server.tool(
  'delete_note',
  'Delete a note from Trilium',
  deleteNoteSchema.shape,
  async (args) => {
    try {
      const result = await deleteNote(getClient(), deleteNoteSchema.parse(args));
      return { content: [{ type: 'text', text: result }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
    }
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Failed to start trilium-bolt:', error);
  process.exit(1);
});
