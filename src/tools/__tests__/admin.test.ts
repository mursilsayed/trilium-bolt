import { describe, it, expect, vi } from 'vitest';
import { createBackup, createRevision } from '../admin.js';
import type { TriliumClient } from '../../trilium-client.js';

function mockClient(overrides: Record<string, unknown> = {}) {
  return {
    createBackup: vi.fn().mockResolvedValue(undefined),
    createRevision: vi.fn().mockResolvedValue(undefined),
    listRevisions: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as TriliumClient;
}

describe('createBackup', () => {
  it('calls client with correct backup name', async () => {
    const client = mockClient();

    const result = await createBackup(client, { backupName: 'my-backup' });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.backupName).toBe('my-backup');
    expect((client.createBackup as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('my-backup');
  });
});

describe('createRevision', () => {
  it('calls client with correct noteId', async () => {
    const client = mockClient();

    const result = await createRevision(client, { noteId: 'note123' });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.noteId).toBe('note123');
    expect((client.createRevision as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('note123');
  });

  it('returns revisionId from the newest listed revision', async () => {
    const client = mockClient({
      listRevisions: vi.fn().mockResolvedValue([
        { revisionId: 'rev-new', dateCreated: '2024-01-02' },
        { revisionId: 'rev-old', dateCreated: '2024-01-01' },
      ]),
    });

    const result = await createRevision(client, { noteId: 'note123' });

    const parsed = JSON.parse(result);
    expect(parsed.revisionId).toBe('rev-new');
  });

  it('succeeds with revisionId undefined when listRevisions throws', async () => {
    const client = mockClient({
      listRevisions: vi.fn().mockRejectedValue(new Error('boom')),
    });

    const result = await createRevision(client, { noteId: 'note123' });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.revisionId).toBeUndefined();
  });
});
