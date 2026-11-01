import { describe, it, expect, vi } from 'vitest';
import { searchNotes, searchNotesSchema } from '../search.js';
import type { TriliumClient } from '../../trilium-client.js';

describe('searchNotes includeArchived', () => {
  it('defaults to false', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const client = { searchNotes: search } as unknown as TriliumClient;

    await searchNotes(client, searchNotesSchema.parse({ query: '#map' }));

    expect(search).toHaveBeenCalledWith('#map', 100, false);
  });

  it('is passed to the client', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const client = { searchNotes: search } as unknown as TriliumClient;

    await searchNotes(client, searchNotesSchema.parse({ query: '#map', includeArchived: true }));

    expect(search).toHaveBeenCalledWith('#map', 100, true);
  });
});
