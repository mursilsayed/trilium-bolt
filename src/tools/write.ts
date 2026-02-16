/**
 * Write tools for Trilium Notes
 */

import { z } from 'zod';
import { marked } from 'marked';
import type { TriliumClient } from '../trilium-client.js';

const attributeSchema = z.object({
  type: z
    .enum(['label', 'relation'])
    .optional()
    .default('label')
    .describe('Type of attribute: "label" for key-value tags, "relation" for links to other notes (default: "label")'),
  name: z.string().describe('Name of the attribute (e.g., "priority", "tag", "cssClass")'),
  value: z
    .string()
    .optional()
    .default('')
    .describe('Value of the attribute. For labels this is the tag value, for relations this is the target noteId'),
  isInheritable: z
    .boolean()
    .optional()
    .default(false)
    .describe('Whether the attribute is inherited by child notes (default: false)'),
});

export const createNoteSchema = z.object({
  parentNoteId: z
    .string()
    .optional()
    .default('root')
    .describe('ID of the parent note (default: "root" for top-level)'),
  title: z.string().describe('Title of the new note'),
  content: z.string().describe('Content of the note. Markdown by default — use contentFormat to switch to HTML.'),
  contentFormat: z
    .enum(['markdown', 'html'])
    .optional()
    .default('markdown')
    .describe('Format of the content: "markdown" (default) or "html". When "markdown", content is converted to HTML before saving.'),
  type: z
    .enum(['text', 'code', 'file', 'image', 'search', 'book', 'relationMap', 'render'])
    .optional()
    .default('text')
    .describe('Type of note (default: "text")'),
  mime: z
    .string()
    .optional()
    .describe('MIME type for code notes (e.g., "application/javascript")'),
  attributes: z
    .array(attributeSchema)
    .optional()
    .describe('Attributes (labels/relations) to attach to the note. Example: [{"name": "tag", "value": "recipe"}, {"name": "priority", "value": "high"}]'),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export async function createNote(
  client: TriliumClient,
  input: CreateNoteInput
): Promise<string> {
  const content = input.contentFormat !== 'html'
    ? await marked.parse(input.content)
    : input.content;

  const result = await client.createNote({
    parentNoteId: input.parentNoteId,
    title: input.title,
    content,
    type: input.type,
    mime: input.mime,
  });

  const noteId = result.note.noteId;
  const createdAttributes = [];

  if (input.attributes?.length) {
    for (const attr of input.attributes) {
      const created = await client.createAttribute(noteId, {
        type: attr.type,
        name: attr.name,
        value: attr.value,
        isInheritable: attr.isInheritable,
      });
      createdAttributes.push({
        type: created.type,
        name: created.name,
        value: created.value,
      });
    }
  }

  return JSON.stringify(
    {
      success: true,
      noteId,
      title: result.note.title,
      type: result.note.type,
      parentNoteId: input.parentNoteId,
      attributes: createdAttributes,
    },
    null,
    2
  );
}

export const updateNoteSchema = z.object({
  noteId: z.string().describe('ID of the note to update'),
  title: z.string().optional().describe('New title for the note'),
  content: z.string().optional().describe('New content for the note. Markdown by default — use contentFormat to switch to HTML.'),
  contentFormat: z
    .enum(['markdown', 'html'])
    .optional()
    .default('markdown')
    .describe('Format of the content: "markdown" (default) or "html". When "markdown", content is converted to HTML before saving.'),
  attributes: z
    .array(attributeSchema)
    .optional()
    .describe('Attributes to set on the note. If an attribute with the same type and name exists, its value will be updated; otherwise a new attribute is created.'),
});

export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export async function updateNote(
  client: TriliumClient,
  input: UpdateNoteInput
): Promise<string> {
  if (!input.title && !input.content && !input.attributes?.length) {
    throw new Error('At least one of "title", "content", or "attributes" must be provided');
  }

  const updates: string[] = [];

  if (input.title) {
    await client.updateNoteTitle(input.noteId, input.title);
    updates.push('title');
  }

  if (input.content) {
    const content = input.contentFormat !== 'html'
      ? await marked.parse(input.content)
      : input.content;
    await client.updateNoteContent(input.noteId, content);
    updates.push('content');
  }

  const updatedAttributes = [];

  if (input.attributes?.length) {
    // Fetch existing attributes to check for updates vs creates
    const note = await client.getNote(input.noteId);
    const existingAttrs = note.attributes;

    for (const attr of input.attributes) {
      const existing = existingAttrs.find(
        (a) => a.type === attr.type && a.name === attr.name
      );

      if (existing) {
        await client.updateAttribute(existing.attributeId, attr.value);
        updatedAttributes.push({ action: 'updated', type: attr.type, name: attr.name, value: attr.value });
      } else {
        await client.createAttribute(input.noteId, {
          type: attr.type,
          name: attr.name,
          value: attr.value,
          isInheritable: attr.isInheritable,
        });
        updatedAttributes.push({ action: 'created', type: attr.type, name: attr.name, value: attr.value });
      }
    }

    updates.push('attributes');
  }

  return JSON.stringify(
    {
      success: true,
      noteId: input.noteId,
      updated: updates,
      attributes: updatedAttributes,
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
