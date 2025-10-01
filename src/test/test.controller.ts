import { Controller, Post, Body, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { TestService } from './test.service';

export interface TestSharedVolumeRequest {
    testData: string;
}

export interface TestSharedVolumeResponse {
    success: boolean;
    testId: string;
    expectedData: string;
    actualData?: string;
    matchResult: boolean;
    message: string;
    rustServiceResponse?: any;
}

@Controller('test')
export class TestController {
    private readonly logger = new Logger(TestController.name);

    constructor(private readonly testService: TestService) { }

    /**
     * Test shared volume communication between NestJS and Rust services
     * 
     * This endpoint:
     * 1. Writes test data to the shared volume
     * 2. Calls the Rust service to read and verify the data
     * 3. Returns the comparison result
     */
    @Post('shared-volume')
    async testSharedVolume(@Body() request: TestSharedVolumeRequest): Promise<TestSharedVolumeResponse> {
        try {
            this.logger.log(`Testing shared volume communication with data: "${request.testData}"`);

            // Generate a unique test ID
            const testId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // Step 1: Write test data to shared volume (NestJS side)
            await this.testService.writeTestData(testId, request.testData);
            this.logger.log(`✅ Step 1: Test data written to shared volume with ID: ${testId}`);

            // Step 2: Call Rust service to read and verify the data
            const rustResponse = await this.testService.callRustTestEndpoint(testId, request.testData);
            this.logger.log(`✅ Step 2: Rust service response received`);

            // Step 3: Clean up test file
            await this.testService.cleanupTestData(testId);
            this.logger.log(`✅ Step 3: Test data cleaned up`);

            // Return comprehensive test result
            const directMode = rustResponse?.mode === 'direct';
            return {
                success: true,
                testId,
                expectedData: request.testData,
                actualData: rustResponse.actual_data,
                matchResult: rustResponse.match_result,
                message: directMode
                    ? '✅ DIRECT MODE: Test passed without shared volume.'
                    : (rustResponse.match_result
                        ? '🎉 SUCCESS: Shared volume communication is working correctly!'
                        : '❌ FAILURE: Shared volume communication has issues'),
                rustServiceResponse: rustResponse,
            };

        } catch (error) {
            this.logger.error('Shared volume test failed:', error);

            throw new HttpException({
                success: false,
                message: `Test failed: ${error.message}`,
                error: error.stack,
            }, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    @Post('diagnostics')
    async diagnostics() {
        try {
            return await this.testService.getDiagnostics();
        } catch (e) {
            this.logger.error('Diagnostics failed', e);
            throw new HttpException({ error: (e as any).message }, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}
