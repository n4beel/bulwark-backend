export interface UploadAnalysisResponse {
    projectName: string;
    repositoryInfo: {
        name: string;
        fullName: string;
        description: string;
        language: string;
        size: number;
        private: boolean;
        uploadedAt: Date;
        originalFilename: string;
        extractedPath: string;
    };
    analysis: {
        totalLines: number;
        solidityFiles: number;
        contractFiles: string[];
        dependencies: string[];
        framework: string;
        testFiles: number;
        complexity: 'low' | 'medium' | 'high';
    };
    generatedAt: Date;
}

export interface FileUploadResult {
    success: boolean;
    message: string;
    data?: UploadAnalysisResponse;
    error?: string;
}
