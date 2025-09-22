import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { GitHubService } from '../github/github.service';
import { UploadAnalysisResponse } from './dto/upload.dto';
import * as fs from 'fs';
import * as path from 'path';
import * as AdmZip from 'adm-zip';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class UploadsService {
    private readonly logger = new Logger(UploadsService.name);
    private readonly tempDir = path.join(process.cwd(), 'temp', 'extracted');

    constructor(private readonly githubService: GitHubService) {
        // Ensure temp directory exists
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Discover files in uploaded archive (like GitHub contents API)
     */
    async discoverFilesInUpload(
        filePath: string,
        originalFilename: string,
    ): Promise<any> {
        this.logger.log(`Discovering files in uploaded archive: ${originalFilename}`);

        try {
            // Step 1: Extract the uploaded file
            const extractedPath = await this.extractFile(filePath, originalFilename);

            // Step 2: Discover all files (similar to GitHub API)
            const fileStructure = this.buildFileStructure(extractedPath);

            // Step 3: Get basic project info
            const projectName = path.parse(originalFilename).name;
            const language = this.detectLanguageFromFiles(extractedPath);
            const framework = this.detectFrameworkFromFiles(extractedPath);

            // Step 4: Store extraction info for later analysis
            const uploadSession = {
                extractedPath,
                originalFilename,
                projectName,
                uploadedAt: new Date(),
            };

            // Store session info (in production, use Redis or database)
            this.storeUploadSession(extractedPath, uploadSession);

            // Step 5: Build response similar to GitHub repo discovery
            const response = {
                id: Date.now(),
                name: projectName,
                full_name: `uploaded/${projectName}`,
                description: `Uploaded contract files from ${originalFilename}`,
                language,
                framework,
                size: Math.round(fs.statSync(filePath).size / 1024), // Size in KB
                private: true,
                uploaded_at: new Date(),
                contents: fileStructure, // File tree structure
                contract_files: this.getContractFiles(fileStructure),
                test_files: this.getTestFiles(fileStructure),
                total_files: this.countAllFiles(fileStructure),
                extractedPath, // For later analysis reference
            };

            // Cleanup uploaded file (keep extracted)
            this.cleanupUploadedFile(filePath);

            this.logger.log(`File discovery completed for: ${originalFilename}`);
            return response;

        } catch (error) {
            this.logger.error(`Failed to discover files in upload: ${error.message}`);
            this.cleanupUploadedFile(filePath);
            throw error;
        }
    }

    /**
     * Analyze uploaded contract files (called after file discovery)
     */
    async analyzeUploadedFile(
        extractedPath: string,
        selectedFiles?: string[],
    ): Promise<any> {
        this.logger.log(`Starting analysis of uploaded files at: ${extractedPath}`);

        try {
            // Get upload session info
            const uploadSession = this.getUploadSession(extractedPath);
            if (!uploadSession) {
                throw new Error('Upload session not found. Please upload files first.');
            }

            // Step 1: Analyze the extracted contents using existing GitHub analysis logic
            const analysis = await this.githubService.analyzeRepository(extractedPath, selectedFiles);

            // Step 2: Build response
            return {
                success: true,
                analysis,
                extractedPath,
                uploadSession,
            };

        } catch (error) {
            this.logger.error(`Failed to analyze uploaded files: ${error.message}`);
            throw error;
        }
    }

    /**
     * Extract uploaded file based on its type
     */
    private async extractFile(filePath: string, originalFilename: string): Promise<string> {
        const timestamp = Date.now();
        const extractedDirName = `${path.parse(originalFilename).name}-${timestamp}`;
        const extractedPath = path.join(this.tempDir, extractedDirName);

        // Create extraction directory
        if (!fs.existsSync(extractedPath)) {
            fs.mkdirSync(extractedPath, { recursive: true });
        }

        const fileExt = path.extname(originalFilename).toLowerCase();

        try {
            if (fileExt === '.zip') {
                await this.extractZip(filePath, extractedPath);
            } else if (originalFilename.toLowerCase().includes('.tar.gz') || fileExt === '.tar') {
                await this.extractTarGz(filePath, extractedPath);
            } else if (fileExt === '.rar') {
                await this.extractRar(filePath, extractedPath);
            } else if (fileExt === '.7z') {
                await this.extract7z(filePath, extractedPath);
            } else {
                throw new Error(`Unsupported file format: ${fileExt}`);
            }

            this.logger.log(`Successfully extracted ${originalFilename} to ${extractedPath}`);
            return extractedPath;

        } catch (error) {
            // Cleanup on extraction failure
            if (fs.existsSync(extractedPath)) {
                fs.rmSync(extractedPath, { recursive: true, force: true });
            }
            throw error;
        }
    }

    /**
     * Extract ZIP files
     */
    private async extractZip(filePath: string, extractedPath: string): Promise<void> {
        try {
            const zip = new AdmZip(filePath);
            zip.extractAllTo(extractedPath, true);
        } catch (error) {
            throw new Error(`Failed to extract ZIP file: ${error.message}`);
        }
    }

    /**
     * Extract TAR.GZ files using system tar command
     */
    private async extractTarGz(filePath: string, extractedPath: string): Promise<void> {
        try {
            await execAsync(`tar -xzf "${filePath}" -C "${extractedPath}"`);
        } catch (error) {
            throw new Error(`Failed to extract TAR.GZ file: ${error.message}`);
        }
    }

    /**
     * Extract RAR files using system unrar command
     */
    private async extractRar(filePath: string, extractedPath: string): Promise<void> {
        try {
            await execAsync(`unrar x "${filePath}" "${extractedPath}/"`);
        } catch (error) {
            // Try alternative rar command
            try {
                await execAsync(`rar x "${filePath}" "${extractedPath}/"`);
            } catch (altError) {
                throw new Error(`Failed to extract RAR file: ${error.message}. Make sure unrar or rar is installed.`);
            }
        }
    }

    /**
     * Extract 7Z files using system 7z command
     */
    private async extract7z(filePath: string, extractedPath: string): Promise<void> {
        try {
            await execAsync(`7z x "${filePath}" -o"${extractedPath}"`);
        } catch (error) {
            throw new Error(`Failed to extract 7Z file: ${error.message}. Make sure 7z is installed.`);
        }
    }

    /**
     * Detect programming language from extracted files
     */
    private detectLanguageFromFiles(extractedPath: string): string {
        try {
            const files = this.getAllFiles(extractedPath);

            // Count file extensions
            const extensions = files.map(file => path.extname(file).toLowerCase());
            const extCounts = extensions.reduce((acc, ext) => {
                acc[ext] = (acc[ext] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);

            // Determine primary language
            if (extCounts['.rs'] > 0) return 'Rust';
            if (extCounts['.sol'] > 0) return 'Solidity';
            if (extCounts['.js'] > 0 || extCounts['.ts'] > 0) return 'JavaScript/TypeScript';
            if (extCounts['.py'] > 0) return 'Python';
            if (extCounts['.go'] > 0) return 'Go';

            return 'Unknown';
        } catch (error) {
            this.logger.warn(`Failed to detect language: ${error.message}`);
            return 'Unknown';
        }
    }

    /**
     * Get all files recursively from a directory
     */
    private getAllFiles(dirPath: string): string[] {
        const files: string[] = [];

        const scanDirectory = (currentPath: string) => {
            try {
                const items = fs.readdirSync(currentPath);

                for (const item of items) {
                    const fullPath = path.join(currentPath, item);
                    const stat = fs.statSync(fullPath);

                    if (stat.isDirectory()) {
                        scanDirectory(fullPath);
                    } else {
                        files.push(fullPath);
                    }
                }
            } catch (error) {
                this.logger.warn(`Error scanning directory ${currentPath}: ${error.message}`);
            }
        };

        scanDirectory(dirPath);
        return files;
    }

    /**
     * Cleanup uploaded file
     */
    private cleanupUploadedFile(filePath: string): void {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                this.logger.log(`Cleaned up uploaded file: ${filePath}`);
            }
        } catch (error) {
            this.logger.warn(`Failed to cleanup uploaded file: ${error.message}`);
        }
    }

    /**
     * Cleanup extracted directory
     */
    async cleanupExtractedDirectory(extractedPath: string): Promise<void> {
        try {
            if (fs.existsSync(extractedPath)) {
                fs.rmSync(extractedPath, { recursive: true, force: true });
                this.logger.log(`Cleaned up extracted directory: ${extractedPath}`);
            }
        } catch (error) {
            this.logger.warn(`Failed to cleanup extracted directory: ${error.message}`);
        }
    }

    /**
     * Build file structure similar to GitHub API response
     */
    private buildFileStructure(dirPath: string): any[] {
        const buildStructureRecursive = (currentPath: string, relativePath: string = ''): any[] => {
            const items: any[] = [];

            try {
                const dirItems = fs.readdirSync(currentPath);

                for (const item of dirItems) {
                    const fullPath = path.join(currentPath, item);
                    const itemRelativePath = relativePath ? path.join(relativePath, item) : item;
                    const stat = fs.statSync(fullPath);

                    const fileInfo: any = {
                        name: item,
                        path: itemRelativePath,
                        type: stat.isDirectory() ? 'dir' : 'file',
                        size: stat.isFile() ? stat.size : 0,
                        sha: '', // Not needed for uploads
                        url: '', // Not needed for uploads
                        html_url: '', // Not needed for uploads
                        git_url: '', // Not needed for uploads
                        download_url: '', // Not needed for uploads
                    };

                    if (stat.isDirectory()) {
                        fileInfo.contents = buildStructureRecursive(fullPath, itemRelativePath);
                    }

                    items.push(fileInfo);
                }
            } catch (error) {
                this.logger.warn(`Error reading directory ${currentPath}: ${error.message}`);
            }

            return items;
        };

        return buildStructureRecursive(dirPath);
    }

    /**
     * Get contract files from file structure
     */
    private getContractFiles(fileStructure: any[]): string[] {
        const contractFiles: string[] = [];

        const findContractFiles = (items: any[]) => {
            for (const item of items) {
                if (item.type === 'file') {
                    const ext = path.extname(item.name).toLowerCase();
                    if (ext === '.rs' || ext === '.sol') {
                        contractFiles.push(item.path);
                    }
                } else if (item.type === 'dir' && item.contents) {
                    findContractFiles(item.contents);
                }
            }
        };

        findContractFiles(fileStructure);
        return contractFiles;
    }

    /**
     * Get test files from file structure
     */
    private getTestFiles(fileStructure: any[]): string[] {
        const testFiles: string[] = [];

        const findTestFiles = (items: any[]) => {
            for (const item of items) {
                if (item.type === 'file') {
                    const name = item.name.toLowerCase();
                    if (name.includes('test') || name.includes('spec')) {
                        testFiles.push(item.path);
                    }
                } else if (item.type === 'dir' && item.contents) {
                    if (item.name.toLowerCase() === 'tests' || item.name.toLowerCase() === 'test') {
                        findTestFiles(item.contents);
                    } else {
                        findTestFiles(item.contents);
                    }
                }
            }
        };

        findTestFiles(fileStructure);
        return testFiles;
    }

    /**
     * Count all files in structure
     */
    private countAllFiles(fileStructure: any[]): number {
        let count = 0;

        const countFiles = (items: any[]) => {
            for (const item of items) {
                if (item.type === 'file') {
                    count++;
                } else if (item.type === 'dir' && item.contents) {
                    countFiles(item.contents);
                }
            }
        };

        countFiles(fileStructure);
        return count;
    }

    /**
     * Detect framework from extracted files
     */
    private detectFrameworkFromFiles(extractedPath: string): string {
        try {
            // Check for Cargo.toml
            const cargoTomlPath = path.join(extractedPath, 'Cargo.toml');
            if (fs.existsSync(cargoTomlPath)) {
                const cargoContent = fs.readFileSync(cargoTomlPath, 'utf-8');
                if (cargoContent.includes('anchor-lang')) return 'anchor';
                if (cargoContent.includes('solana-program')) return 'native';
            }

            // Check for Anchor.toml
            const anchorTomlPath = path.join(extractedPath, 'Anchor.toml');
            if (fs.existsSync(anchorTomlPath)) return 'anchor';

            return 'unknown';
        } catch (error) {
            return 'unknown';
        }
    }

    // Simple in-memory session store (use Redis in production)
    private uploadSessions: Map<string, any> = new Map();

    /**
     * Store upload session info
     */
    private storeUploadSession(extractedPath: string, session: any): void {
        this.uploadSessions.set(extractedPath, session);
    }

    /**
     * Get upload session info
     */
    public getUploadSession(extractedPath: string): any {
        return this.uploadSessions.get(extractedPath);
    }
}
