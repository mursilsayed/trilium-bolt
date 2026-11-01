/**
 * Reads note content from a local file, limited to the folder named by
 * TRILIUM_CONTENT_DIR so the tools can't be used to read any file on the computer.
 */

import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export async function readContentFile(filePath: string): Promise<string> {
  const allowedDir = process.env.TRILIUM_CONTENT_DIR;
  if (!allowedDir) {
    throw new Error('"contentFilePath" is disabled. Set TRILIUM_CONTENT_DIR in the server configuration to enable it.');
  }

  // Compare real paths so a symbolic link can't lead outside the folder.
  const root = await realpath(allowedDir);
  const resolved = await realpath(resolve(root, filePath));
  const fromRoot = relative(root, resolved);

  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error(`"${filePath}" is outside the folder set by TRILIUM_CONTENT_DIR`);
  }

  if (!(await stat(resolved)).isFile()) {
    throw new Error(`"${filePath}" is not a regular file`);
  }

  // Notes are sent to Trilium as text, so reject bytes that can't survive that
  // rather than replacing them. ignoreBOM keeps a byte order mark in the output.
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await readFile(resolved));
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`"${filePath}" is not valid UTF-8 text`);
    }
    throw error;
  }
}
