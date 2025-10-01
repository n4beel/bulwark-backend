import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import axios from 'axios';
import { existsSync } from 'fs';

export interface RustTestResponse {
    success: boolean;
    test_id: string;
    expected_data: string;
    actual_data?: string;
    match_result: boolean;
    message: string;
    mode?: string; // present in direct mode
}

export interface RustDirectTestResponse {
    success: boolean;
    test_id: string;
    expected_data: string;
    actual_data?: string;
    match_result: boolean;
    message: string;
    mode?: string;
}

@Injectable()
export class TestService {
    private readonly logger = new Logger(TestService.name);
    private readonly rustServiceUrl: string;
    private readonly sharedVolumePath: string;
    private readonly directMode: boolean;
    private lastRustError?: string;

    constructor() {
        const raw = process.env.RUST_ANALYZER_URL || 'http://localhost:8080';
        // Auto-prefix scheme if user only sets host[:port] (common when using private service names)
        if (!/^https?:\/\//i.test(raw)) {
            this.rustServiceUrl = `http://${raw}`;
            this.logger.log(`Normalized RUST_ANALYZER_URL (added scheme): ${this.rustServiceUrl}`);
        } else {
            this.rustServiceUrl = raw;
        }
        this.sharedVolumePath = process.env.SHARED_WORKSPACE_PATH || '/tmp/shared/workspaces';
        this.directMode =
            ['1', 'true', 'yes'].includes((process.env.DIRECT_MODE || '').toLowerCase()) ||
            ['1', 'true', 'yes'].includes((process.env.NO_SHARED_VOLUME || '').toLowerCase());
    }

    /**
     * Write test data to the shared volume
     */
    async writeTestData(testId: string, testData: string): Promise<void> {
        if (this.directMode) {
            this.logger.debug('Direct mode enabled: skipping writeTestData filesystem operation');
            return;
        }
        try {
            // Create test directory in shared volume
            const testDir = path.join(this.sharedVolumePath, 'test');
            await fs.mkdir(testDir, { recursive: true });

            // Write test data to file
            const testFilePath = path.join(testDir, `${testId}.txt`);
            await fs.writeFile(testFilePath, testData, 'utf8');

            this.logger.debug(`Test data written to: ${testFilePath}`);
        } catch (error) {
            this.logger.error(`Failed to write test data for ${testId}:`, error);
            throw new Error(`Failed to write test data: ${error.message}`);
        }
    }

    /**
     * Call the Rust service test endpoint to read and verify data
     */
    async callRustTestEndpoint(testId: string, expectedData: string): Promise<RustTestResponse> {
        try {
            this.logger.debug(`Calling Rust test endpoint for testId: ${testId}`);
            const endpoint = this.directMode ? '/test-direct' : '/test';
            const payload = this.directMode
                ? { test_id: testId, test_data: expectedData }
                : { test_id: testId, expected_data: expectedData };
            const primaryUrl = `${this.rustServiceUrl}${endpoint}`;
            let lastError: any;
            const attemptUrls: string[] = [primaryUrl];
            // If original env lacked scheme and user accidentally included trailing slash etc., we can add a trimmed variant
            if (primaryUrl.includes('//') && primaryUrl.endsWith('//' + endpoint.replace(/^\//, ''))) {
                attemptUrls.push(primaryUrl.replace(/\/+$/, ''));
            }
            for (const url of attemptUrls) {
                try {
                    const response = await axios.post(url, payload, { timeout: 10000 });
                    if (response.status === 200) {
                        this.lastRustError = undefined;
                        return response.data as RustTestResponse;
                    }
                    lastError = new Error(`Rust service returned status ${response.status}`);
                } catch (err) {
                    lastError = err;
                    continue; // try next form
                }
            }
            throw lastError || new Error('Unknown error contacting Rust service');
        } catch (error) {
            this.logger.error(`Failed to call Rust test endpoint:`, error);
            this.lastRustError = (error as any)?.message || String(error);

            if (axios.isAxiosError(error)) {
                if (error.response) {
                    // Server responded with error status
                    throw new Error(`Rust service error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
                } else if (error.request) {
                    // Request was made but no response received
                    throw new Error(`Rust service unavailable: ${error.message}`);
                }
            }

            throw new Error(`Rust test call failed: ${error.message}`);
        }
    }

    /**
     * Clean up test data from shared volume
     */
    async cleanupTestData(testId: string): Promise<void> {
        if (this.directMode) {
            this.logger.debug('Direct mode enabled: skipping cleanupTestData filesystem operation');
            return;
        }
        try {
            const testFilePath = path.join(this.sharedVolumePath, 'test', `${testId}.txt`);

            if (existsSync(testFilePath)) {
                await fs.unlink(testFilePath);
                this.logger.debug(`Test file cleaned up: ${testFilePath}`);
            }
        } catch (error) {
            // Don't throw error for cleanup failures, just log
            this.logger.warn(`Failed to cleanup test data for ${testId}:`, error);
        }
    }

    /**
     * Check if Rust service is available
     */
    async isRustServiceAvailable(): Promise<boolean> {
        try {
            const response = await axios.get(`${this.rustServiceUrl}/health`, {
                timeout: 5000,
            });
            return response.status === 200 && response.data?.status === 'healthy';
        } catch (error) {
            this.logger.warn('Rust service health check failed:', error);
            return false;
        }
    }

    /**
     * Get shared volume info for debugging
     */
    async getSharedVolumeInfo(): Promise<{
        path: string;
        exists: boolean;
        testDirExists: boolean;
        files?: string[];
    }> {
        const testDir = path.join(this.sharedVolumePath, 'test');

        const info = {
            path: this.sharedVolumePath,
            exists: existsSync(this.sharedVolumePath),
            testDirExists: existsSync(testDir),
            files: undefined as string[] | undefined,
        };

        try {
            if (info.testDirExists) {
                const files = await fs.readdir(testDir);
                info.files = files;
            }
        } catch (error) {
            this.logger.warn('Failed to read test directory:', error);
        }

        return info;
    }

    /**
     * Diagnostics summary for debugging configuration in direct or shared mode.
     */
    async getDiagnostics(): Promise<any> {
        const health = await this.isRustServiceAvailable();
        return {
            rustServiceUrl: this.rustServiceUrl,
            directMode: this.directMode,
            env: {
                RUST_ANALYZER_URL: process.env.RUST_ANALYZER_URL,
                DIRECT_MODE: process.env.DIRECT_MODE,
                NO_SHARED_VOLUME: process.env.NO_SHARED_VOLUME,
            },
            rustHealth: health,
            lastRustError: this.lastRustError,
            timestamp: new Date().toISOString(),
        };
    }
}
