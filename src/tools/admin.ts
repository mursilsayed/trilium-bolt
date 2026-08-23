/**
 * Admin/utility tools for Trilium Notes
 */

import { z } from 'zod';
import type { TriliumClient } from '../trilium-client.js';

export const createBackupSchema = z.object({
  backupName: z.string().describe('Name for the backup file'),
});

export type CreateBackupInput = z.infer<typeof createBackupSchema>;

export async function createBackup(
  client: TriliumClient,
  input: CreateBackupInput
): Promise<string> {
  await client.createBackup(input.backupName);

  return JSON.stringify(
    {
      success: true,
      backupName: input.backupName,
      message: 'Backup created successfully',
    },
    null,
    2
  );
}

export const createRevisionSchema = z.object({
  noteId: z.string().describe('ID of the note to create a revision snapshot for'),
});

export type CreateRevisionInput = z.infer<typeof createRevisionSchema>;

export async function createRevision(
  client: TriliumClient,
  input: CreateRevisionInput
): Promise<string> {
  await client.createRevision(input.noteId);

  return JSON.stringify(
    {
      success: true,
      noteId: input.noteId,
      message: 'Revision created successfully',
    },
    null,
    2
  );
}
