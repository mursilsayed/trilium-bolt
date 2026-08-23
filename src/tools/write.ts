/**
 * Write tools for Trilium Notes
 */

import { z } from 'zod';
import { marked } from 'marked';
import { NodeHtmlMarkdown } from 'node-html-markdown';
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const patchNoteSchema = z.object({
  noteId: z.string().describe('ID of the note to patch'),
  search: z.string().describe('Literal text (or regex pattern, if isRegex is true) to find in the note content'),
  replace: z.string().describe('Text to replace the match with'),
  isRegex: z
    .boolean()
    .optional()
    .default(false)
    .describe('Treat "search" as a regular expression instead of literal text (default: false)'),
  occurrence: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('1-based index of the match to replace. Required when "search" matches more than one location.'),
  contentFormat: z
    .enum(['markdown', 'html'])
    .optional()
    .default('markdown')
    .describe('Format "search" and "replace" are expressed in: "markdown" (default, matches what get_note returns) or "html" (the raw stored format)'),
});

export type PatchNoteInput = z.infer<typeof patchNoteSchema>;

export async function patchNote(
  client: TriliumClient,
  input: PatchNoteInput
): Promise<string> {
  const rawHtml = await client.getNoteContent(input.noteId);
  const workingContent = input.contentFormat === 'html'
    ? rawHtml
    : NodeHtmlMarkdown.translate(rawHtml);

  const pattern = new RegExp(
    input.isRegex ? input.search : escapeRegExp(input.search),
    'g'
  );

  const matches = [...workingContent.matchAll(pattern)];

  if (matches.length === 0) {
    throw new Error(`No match found for "${input.search}"`);
  }

  if (matches.length > 1 && !input.occurrence) {
    throw new Error(
      `"${input.search}" matches ${matches.length} locations. Provide "occurrence" (1-${matches.length}) to disambiguate.`
    );
  }

  const targetOccurrence = input.occurrence ?? 1;
  if (targetOccurrence > matches.length) {
    throw new Error(
      `"occurrence" ${targetOccurrence} is out of range; "${input.search}" matches ${matches.length} location(s).`
    );
  }

  let seen = 0;
  const patchedContent = workingContent.replace(pattern, (match) => {
    seen += 1;
    return seen === targetOccurrence ? input.replace : match;
  });

  const newHtml = input.contentFormat === 'html'
    ? patchedContent
    : await marked.parse(patchedContent);

  await client.updateNoteContent(input.noteId, newHtml);

  return JSON.stringify(
    {
      success: true,
      noteId: input.noteId,
      matchCount: matches.length,
      occurrenceReplaced: targetOccurrence,
    },
    null,
    2
  );
}

export const deleteAttributeSchema = z.object({
  noteId: z.string().describe('ID of the note to remove the attribute from'),
  attributeName: z.string().describe('Name of the attribute to delete'),
  attributeType: z
    .enum(['label', 'relation'])
    .optional()
    .default('label')
    .describe('Type of attribute to delete (default: "label")'),
});

export type DeleteAttributeInput = z.infer<typeof deleteAttributeSchema>;

export async function deleteAttribute(
  client: TriliumClient,
  input: DeleteAttributeInput
): Promise<string> {
  const note = await client.getNote(input.noteId);
  const type = input.attributeType ?? 'label';
  const attr = note.attributes.find(
    (a) => a.type === type && a.name === input.attributeName
  );

  if (!attr) {
    throw new Error(
      `Attribute "${input.attributeName}" of type "${type}" not found on note ${input.noteId}`
    );
  }

  await client.deleteAttribute(attr.attributeId);

  return JSON.stringify(
    {
      success: true,
      noteId: input.noteId,
      attributeId: attr.attributeId,
      type: attr.type,
      name: attr.name,
      message: 'Attribute deleted successfully',
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
