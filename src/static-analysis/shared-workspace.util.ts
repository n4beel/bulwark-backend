import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';

const logger = new Logger('SharedWorkspaceUtil');

export interface WorkspaceStagingResult {
    workspaceId: string;
    sharedPath: string;
    sourcePath: string;
    copiedFiles: number;
}

/**
 * Determine shared workspace base path from env or default (must match rust service fallback)
 */
export function getSharedWorkspaceBase(): string {
    return process.env.SHARED_WORKSPACE_PATH || '/tmp/shared/workspaces';
}

/**
 * Generate a sanitized workspace id (prevent traversal)
 */
export function generateWorkspaceId(baseName: string): string {
    const safe = baseName.replace(/[^a-zA-Z0-9._-]/g, '-');
    const suffix = Date.now().toString(36);
    return `${safe}-${suffix}`;
}

/**
 * Copy entire repository/upload directory into the shared workspace path.
 * Returns workspace id and destination path.
 */
export function stageWorkspace(sourcePath: string, workspaceId?: string): WorkspaceStagingResult {
    if (!fs.existsSync(sourcePath)) {
        throw new Error(`Source path does not exist: ${sourcePath}`);
    }

    const base = getSharedWorkspaceBase();
    if (!fs.existsSync(base)) {
        fs.mkdirSync(base, { recursive: true });
    }

    const finalWorkspaceId = workspaceId || generateWorkspaceId(path.basename(sourcePath));
    const dest = path.join(base, finalWorkspaceId);

    if (fs.existsSync(dest)) {
        // Extremely unlikely with timestamp suffix, but ensure uniqueness
        throw new Error(`Destination workspace already exists: ${dest}`);
    }

    // Perform recursive copy (full copy is fine per design)
    let copiedFiles = 0;
    copyRecursive(sourcePath, dest, () => copiedFiles++);
    logger.log(`Staged workspace '${finalWorkspaceId}' -> ${dest} (files=${copiedFiles})`);

    return { workspaceId: finalWorkspaceId, sharedPath: dest, sourcePath, copiedFiles };
}

function copyRecursive(src: string, dest: string, onFile?: () => void) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src)) {
            const s = path.join(src, entry);
            const d = path.join(dest, entry);
            copyRecursive(s, d, onFile);
        }
    } else if (stat.isFile()) {
        fs.copyFileSync(src, dest);
        onFile && onFile();
    }
}
