/**
 * Write tools for Trilium Notes
 */

import { z } from 'zod';
import type { TriliumClient } from '../trilium-client.js';

export const createNoteSchema = z.object({
  parentNoteId: z
    .string()
    .optional()
    .default('root')
    .describe('ID of the parent note (default: "root" for top-level)'),
  title: z.string().describe('Title of the new note'),
  content: z.string().describe('Content of the note (HTML for text notes)'),
  type: z
    .enum(['text', 'code', 'file', 'image', 'search', 'book', 'relationMap', 'render'])
    .optional()
    .default('text')
    .describe('Type of note (default: "text")'),
  mime: z
    .string()
    .optional()
    .describe('MIME type for code notes (e.g., "application/javascript")'),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export async function createNote(
  client: TriliumClient,
  input: CreateNoteInput
): Promise<string> {
  const result = await client.createNote({
    parentNoteId: input.parentNoteId,
    title: input.title,
    content: input.content,
    type: input.type,
    mime: input.mime,
  });

  return JSON.stringify(
    {
      success: true,
      noteId: result.note.noteId,
      title: result.note.title,
      type: result.note.type,
      parentNoteId: input.parentNoteId,
    },
    null,
    2
  );
}

export const updateNoteSchema = z.object({
  noteId: z.string().describe('ID of the note to update'),
  title: z.string().optional().describe('New title for the note'),
  content: z.string().optional().describe('New content for the note'),
});

export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export async function updateNote(
  client: TriliumClient,
  input: UpdateNoteInput
): Promise<string> {
  if (!input.title && !input.content) {
    throw new Error('At least one of "title" or "content" must be provided');
  }

  const updates: string[] = [];

  if (input.title) {
    await client.updateNoteTitle(input.noteId, input.title);
    updates.push('title');
  }

  if (input.content) {
    await client.updateNoteContent(input.noteId, input.content);
    updates.push('content');
  }

  return JSON.stringify(
    {
      success: true,
      noteId: input.noteId,
      updated: updates,
    },
    null,
    2
  );
}

export const deleteNoteSchema = z.object({
  noteId: z.string().describe('ID of the note to delete'),
});

export type DeleteNoteInput = z.infer<typeof deleteNoteSchema>;

export async function deleteNote(
  client: TriliumClient,
  input: DeleteNoteInput
): Promise<string> {
  await client.deleteNote(input.noteId);

  return JSON.stringify(
    {
      success: true,
      noteId: input.noteId,
      message: 'Note deleted successfully',
    },
    null,
    2
  );
}
