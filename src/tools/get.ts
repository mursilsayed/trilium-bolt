/**
 * Get tools for Trilium Notes
 */

import { z } from 'zod';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import type { TriliumClient } from '../trilium-client.js';

export const getNoteSchema = z.object({
  noteId: z.string().describe('The ID of the note to retrieve'),
  includeContent: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to include the note content (default: true)'),
  contentStart: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Character offset to start the returned content slice from (default: 0)'),
  contentMaxChars: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum number of characters of content to return, for paging through large notes'),
});

export type GetNoteInput = z.infer<typeof getNoteSchema>;

export async function getNote(
  client: TriliumClient,
  input: GetNoteInput
): Promise<string> {
  if (input.includeContent) {
    const note = await client.getNoteWithContent(input.noteId);
    const fullContent = note.type === 'text' ? NodeHtmlMarkdown.translate(note.content) : note.content;

    const start = input.contentStart ?? 0;
    const end = input.contentMaxChars !== undefined ? start + input.contentMaxChars : fullContent.length;
    const slicedContent = fullContent.slice(start, end);
    const truncated = end < fullContent.length;

    return JSON.stringify(
      {
        noteId: note.noteId,
        title: note.title,
        type: note.type,
        mime: note.mime,
        content: slicedContent,
        contentFormat: note.type === 'text' ? 'markdown' : 'raw',
        contentLength: fullContent.length,
        truncated,
        ...(truncated ? { nextStart: end } : {}),
        dateCreated: note.dateCreated,
        dateModified: note.dateModified,
        attributes: note.attributes.map((attr) => ({
          type: attr.type,
          name: attr.name,
          value: attr.value,
        })),
      },
      null,
      2
    );
  }

  const note = await client.getNote(input.noteId);
  return JSON.stringify(
    {
      noteId: note.noteId,
      title: note.title,
      type: note.type,
      mime: note.mime,
      dateCreated: note.dateCreated,
      dateModified: note.dateModified,
      attributes: note.attributes.map((attr) => ({
        type: attr.type,
        name: attr.name,
        value: attr.value,
      })),
    },
    null,
    2
  );
}

export const getNoteTreeSchema = z.object({
  noteId: z
    .string()
    .optional()
    .default('root')
    .describe('The ID of the parent note (default: "root" for top-level notes)'),
  depth: z
    .number()
    .min(1)
    .max(5)
    .optional()
    .default(1)
    .describe('How many levels deep to retrieve (default: 1, max: 5)'),
});

export type GetNoteTreeInput = z.infer<typeof getNoteTreeSchema>;

interface TreeNode {
  noteId: string;
  title: string;
  type: string;
  children?: TreeNode[];
}

async function buildTree(
  client: TriliumClient,
  noteId: string,
  currentDepth: number,
  maxDepth: number
): Promise<TreeNode[]> {
  const children = await client.getNoteChildren(noteId);

  const nodes: TreeNode[] = [];
  for (const child of children) {
    const node: TreeNode = {
      noteId: child.noteId,
      title: child.title,
      type: child.type,
    };

    if (currentDepth < maxDepth && child.childNoteIds.length > 0) {
      node.children = await buildTree(
        client,
        child.noteId,
        currentDepth + 1,
        maxDepth
      );
    }

    nodes.push(node);
  }

  return nodes;
}

export async function getNoteTree(
  client: TriliumClient,
  input: GetNoteTreeInput
): Promise<string> {
  const tree = await buildTree(client, input.noteId, 1, input.depth);

  if (tree.length === 0) {
    return `No child notes found under "${input.noteId}"`;
  }

  return JSON.stringify(
    {
      parentNoteId: input.noteId,
      depth: input.depth,
      children: tree,
    },
    null,
    2
  );
}

export const getRevisionsSchema = z.object({
  noteId: z.string().describe('The ID of the note to list revisions for'),
});

export type GetRevisionsInput = z.infer<typeof getRevisionsSchema>;

export async function getRevisions(
  client: TriliumClient,
  input: GetRevisionsInput
): Promise<string> {
  const revisions = await client.listRevisions(input.noteId);

  return JSON.stringify(
    {
      noteId: input.noteId,
      revisions: revisions.map((rev) => ({
        revisionId: rev.revisionId,
        type: rev.type,
        mime: rev.mime,
        dateCreated: rev.dateCreated,
        dateLastEdited: rev.dateLastEdited,
      })),
    },
    null,
    2
  );
}

export const getRevisionSchema = z.object({
  revisionId: z.string().describe('The ID of the revision to retrieve'),
  includeContent: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to include the revision content (default: true)'),
});

export type GetRevisionInput = z.infer<typeof getRevisionSchema>;

export async function getRevision(
  client: TriliumClient,
  input: GetRevisionInput
): Promise<string> {
  const revision = await client.getRevisionMetadata(input.revisionId);

  if (!input.includeContent) {
    return JSON.stringify(
      {
        revisionId: revision.revisionId,
        noteId: revision.noteId,
        type: revision.type,
        mime: revision.mime,
        dateCreated: revision.dateCreated,
        dateLastEdited: revision.dateLastEdited,
      },
      null,
      2
    );
  }

  const rawContent = await client.getRevisionContent(input.revisionId);

  return JSON.stringify(
    {
      revisionId: revision.revisionId,
      noteId: revision.noteId,
      type: revision.type,
      mime: revision.mime,
      content: revision.type === 'text' ? NodeHtmlMarkdown.translate(rawContent) : rawContent,
      contentFormat: revision.type === 'text' ? 'markdown' : 'raw',
      dateCreated: revision.dateCreated,
      dateLastEdited: revision.dateLastEdited,
    },
    null,
    2
  );
}
