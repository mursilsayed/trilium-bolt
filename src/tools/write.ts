/**
 * Write tools for Trilium Notes
 */

import { z } from 'zod';
import { marked } from 'marked';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import type { TriliumClient } from '../trilium-client.js';
import { readContentFile } from './content-file.js';

const CONTENT_FORMAT_DESCRIPTION =
  'Applies to text notes only: "markdown" (default) converts content to HTML before saving, "html" saves it unchanged. Content of every other note type is always saved unchanged.';

const CONTENT_FILE_PATH_DESCRIPTION =
  'Path of a local UTF-8 file to use as the content, instead of "content". Must be inside the folder set by the TRILIUM_CONTENT_DIR server setting; relative paths are resolved against that folder.';

/** Same rule as get_note: only text notes are stored as HTML. */
async function toStoredContent(
  content: string,
  noteType: string | undefined,
  contentFormat: 'markdown' | 'html' | undefined
): Promise<string> {
  return noteType === 'text' && contentFormat !== 'html'
    ? marked.parse(content)
    : content;
}

async function resolveInputContent(input: {
  content?: string;
  contentFilePath?: string;
}): Promise<string | undefined> {
  if (input.contentFilePath === undefined) {
    return input.content;
  }
  if (input.content !== undefined) {
    throw new Error('Provide either "content" or "contentFilePath", not both');
  }
  return readContentFile(input.contentFilePath);
}

/**
 * The note's utcDateModified after a write. The write has already succeeded here,
 * so a failed read returns null: reporting an error would invite a retry that
 * creates a duplicate note or trips the next concurrency check.
 */
async function readUtcDateModified(
  client: TriliumClient,
  noteId: string
): Promise<string | null> {
  try {
    return (await client.getNote(noteId)).utcDateModified;
  } catch {
    return null;
  }
}

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
  content: z.string().optional().describe('Content of the note. Required unless contentFilePath is given. For text notes, markdown by default; see contentFormat.'),
  contentFilePath: z.string().optional().describe(CONTENT_FILE_PATH_DESCRIPTION),
  contentFormat: z
    .enum(['markdown', 'html'])
    .optional()
    .default('markdown')
    .describe(CONTENT_FORMAT_DESCRIPTION),
  type: z
    .enum(['text', 'code', 'file', 'image', 'search', 'book', 'relationMap', 'render', 'canvas'])
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
  const inputContent = await resolveInputContent(input);
  if (inputContent === undefined) {
    throw new Error('One of "content" or "contentFilePath" must be provided');
  }

  const result = await client.createNote({
    parentNoteId: input.parentNoteId,
    title: input.title,
    content: await toStoredContent(inputContent, input.type, input.contentFormat),
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
      utcDateModified: await readUtcDateModified(client, noteId),
    },
    null,
    2
  );
}

export const updateNoteSchema = z.object({
  noteId: z.string().describe('ID of the note to update'),
  title: z.string().optional().describe('New title for the note'),
  content: z.string().optional().describe('New content for the note; an empty string clears it. For text notes, markdown by default; see contentFormat.'),
  contentFilePath: z.string().optional().describe(CONTENT_FILE_PATH_DESCRIPTION),
  contentFormat: z
    .enum(['markdown', 'html'])
    .optional()
    .default('markdown')
    .describe(CONTENT_FORMAT_DESCRIPTION),
  attributes: z
    .array(attributeSchema)
    .optional()
    .describe('Attributes to set on the note. If an attribute with the same type and name exists, its value will be updated; otherwise a new attribute is created.'),
  expectedUtcDateModified: z
    .string()
    .optional()
    .describe('The utcDateModified value last observed from get_note. If the note has changed since, the update is rejected instead of silently overwriting.'),
});

export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export async function updateNote(
  client: TriliumClient,
  input: UpdateNoteInput
): Promise<string> {
  const inputContent = await resolveInputContent(input);

  if (!input.title && inputContent === undefined && !input.attributes?.length) {
    throw new Error('At least one of "title", "content", "contentFilePath", or "attributes" must be provided');
  }

  // The note is needed for the concurrency check, for existing attributes, and to
  // learn its type when content may need converting.
  const needsNote =
    input.expectedUtcDateModified ||
    input.attributes?.length ||
    (inputContent !== undefined && input.contentFormat !== 'html');
  const current = needsNote ? await client.getNote(input.noteId) : undefined;

  if (input.expectedUtcDateModified && current?.utcDateModified !== input.expectedUtcDateModified) {
    throw new Error(
      `Note ${input.noteId} changed since last read (expected utcDateModified "${input.expectedUtcDateModified}", found "${current?.utcDateModified}"). Re-fetch with get_note before retrying.`
    );
  }

  const updates: string[] = [];

  if (input.title) {
    await client.updateNoteTitle(input.noteId, input.title);
    updates.push('title');
  }

  if (inputContent !== undefined) {
    const content = await toStoredContent(inputContent, current?.type, input.contentFormat);
    await client.updateNoteContent(input.noteId, content);
    updates.push('content');
  }

  const updatedAttributes = [];

  if (input.attributes?.length) {
    const existingAttrs = current?.attributes ?? [];

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
      utcDateModified: await readUtcDateModified(client, input.noteId),
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
    .describe('Applies to text notes only. Format "search" and "replace" are expressed in: "markdown" (default, matches what get_note returns) or "html" (the raw stored format). Every other note type is always patched in its raw stored content, which is also what get_note returns for it.'),
  expectedUtcDateModified: z
    .string()
    .optional()
    .describe('The utcDateModified value last observed from get_note. If the note has changed since, the patch is rejected instead of silently overwriting.'),
});

export type PatchNoteInput = z.infer<typeof patchNoteSchema>;

export async function patchNote(
  client: TriliumClient,
  input: PatchNoteInput
): Promise<string> {
  // Check before reading content: a save between the two reads is kept, because
  // the patch is then applied to the newer content.
  const current = input.expectedUtcDateModified || input.contentFormat !== 'html'
    ? await client.getNote(input.noteId)
    : undefined;

  if (input.expectedUtcDateModified && current?.utcDateModified !== input.expectedUtcDateModified) {
    throw new Error(
      `Note ${input.noteId} changed since last read (expected utcDateModified "${input.expectedUtcDateModified}", found "${current?.utcDateModified}"). Re-fetch with get_note before retrying.`
    );
  }

  const storedContent = await client.getNoteContent(input.noteId);

  // Same rule as get_note: only text notes are stored as HTML.
  const convertsMarkdown = input.contentFormat !== 'html' && current?.type === 'text';

  const workingContent = convertsMarkdown
    ? NodeHtmlMarkdown.translate(storedContent)
    : storedContent;

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

  const newContent = convertsMarkdown
    ? await marked.parse(patchedContent)
    : patchedContent;

  await client.updateNoteContent(input.noteId, newContent);

  return JSON.stringify(
    {
      success: true,
      noteId: input.noteId,
      matchCount: matches.length,
      occurrenceReplaced: targetOccurrence,
      utcDateModified: await readUtcDateModified(client, input.noteId),
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
