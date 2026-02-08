/**
 * Search tool for Trilium Notes
 */

import { z } from 'zod';
import type { TriliumClient } from '../trilium-client.js';

export const searchNotesSchema = z.object({
  query: z
    .string()
    .describe(
      'Search query using Trilium search syntax. Examples: "keyword" (full-text search), "#label" (notes with a label), "#label=value" (label with specific value), "#tag=recipe" (notes tagged "recipe"), "#tag=recipe AND #tag=vegetarian" (notes with multiple tags), "note.title =* prefix" (title prefix match), "#priority AND #status=active" (combining label existence with label value)'
    ),
  limit: z
    .number()
    .min(1)
    .max(1000)
    .optional()
    .default(100)
    .describe('Maximum number of results to return (default: 100)'),
});

export type SearchNotesInput = z.infer<typeof searchNotesSchema>;

export async function searchNotes(
  client: TriliumClient,
  input: SearchNotesInput
): Promise<string> {
  const results = await client.searchNotes(input.query, input.limit);

  if (results.length === 0) {
    return `No notes found matching "${input.query}"`;
  }

  const formatted = results.map((note) => ({
    noteId: note.noteId,
    title: note.title,
    type: note.type,
  }));

  return JSON.stringify(
    {
      count: results.length,
      notes: formatted,
    },
    null,
    2
  );
}
