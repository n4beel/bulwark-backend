# Uploads Module

This module handles file uploads for smart contract analysis, providing an alternative to GitHub repository selection with a **two-step process** that matches the GitHub workflow.

## Features

- **File Upload Support**: Accept zip, tar.gz, rar, and 7z files up to 100MB
- **File Discovery**: Extract and return file structure similar to GitHub API
- **Contract Analysis**: Analyze uploaded smart contracts using the same logic as GitHub repositories
- **Session Management**: Maintain upload sessions for multi-step workflow
- **Temporary Management**: Handle temporary file storage and cleanup

## New Upload Flow (Matches GitHub Experience)

### 🔄 **Upload Flow - API Call Sequence**

```
1. File Upload & Discovery Phase
POST /uploads/discover-files
→ Upload zip, extract, return file structure (like GitHub contents API)

2. Analysis Phase  
POST /static-analysis/analyze-uploaded-contract
→ Analyze previously uploaded files with selection
```

This matches the GitHub flow exactly:
- **GitHub**: Repo selection → File discovery → Analysis
- **Upload**: File upload → File discovery → Analysis

## API Endpoints

### 1. POST /uploads/discover-files

Upload and discover files in the archive (equivalent to GitHub repo discovery).

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body:
  - `file`: The uploaded archive file (zip, tar.gz, rar, or 7z)

**Response:**
```json
{
  "id": 1640995200000,
  "name": "contract-bundle",
  "full_name": "uploaded/contract-bundle",
  "description": "Uploaded contract files from contracts.zip",
  "language": "rust",
  "framework": "anchor",
  "size": 1024,
  "private": true,
  "uploaded_at": "2024-01-01T00:00:00.000Z",
  "contents": [
    {
      "name": "src",
      "path": "src",
      "type": "dir",
      "size": 0,
      "contents": [
        {
          "name": "lib.rs",
          "path": "src/lib.rs",
          "type": "file",
          "size": 2048
        }
      ]
    }
  ],
  "contract_files": ["src/lib.rs", "programs/lending/src/lib.rs"],
  "test_files": ["tests/integration.rs"],
  "total_files": 8,
  "extractedPath": "/tmp/extracted/abc123"
}
```

### 2. POST /static-analysis/analyze-uploaded-contract

Analyze uploaded files with user selection (equivalent to GitHub analysis).

**Request:**
- Method: `POST`
- Content-Type: `application/json`
- Body:
```json
{
  "extractedPath": "/tmp/extracted/abc123",
  "selectedFiles": ["src/lib.rs", "programs/lending/src/lib.rs"]
}
```

**Response:**
```json
{
  "repository": "contract-bundle",
  "repositoryUrl": "uploaded://contracts.zip",
  "language": "rust",
  "framework": "anchor",
  "analysisFactors": {
    "structuralComplexity": { ... },
    "semanticComplexity": { ... },
    "systemicComplexity": { ... },
    "economicComplexity": { ... }
  },
  "scores": {
    "structural": 45,
    "semantic": 62,
    "systemic": 38,
    "economic": 71,
    "overall": 54
  },
  "performance": {
    "analysisTime": 2341,
    "memoryUsage": 15728640
  },
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

## File Support

- **Supported formats**: `.zip`, `.tar.gz`, `.rar`, `.7z`
- **Maximum size**: 100MB
- **Supported languages**: Rust (Solana/Anchor contracts)

## Usage Examples

### Step 1: File Discovery

```javascript
const formData = new FormData();
formData.append('file', contractFile);

const discoveryResponse = await fetch('/uploads/discover-files', {
  method: 'POST',
  body: formData
});

const fileStructure = await discoveryResponse.json();
// User sees file tree and selects files to analyze
```

### Step 2: Analysis with Selection

```javascript
const analysisResponse = await fetch('/static-analysis/analyze-uploaded-contract', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    extractedPath: fileStructure.extractedPath,
    selectedFiles: ['src/lib.rs', 'programs/lending/src/lib.rs']
  })
});

const analysisReport = await analysisResponse.json();
```

### cURL Examples

```bash
# Step 1: Discover files
curl -X POST \
  -F "file=@contracts.zip" \
  http://localhost:3000/uploads/discover-files

# Step 2: Analyze selected files
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"extractedPath":"/tmp/extracted/abc123","selectedFiles":["src/lib.rs"]}' \
  http://localhost:3000/static-analysis/analyze-uploaded-contract
```

## Implementation Details

### Session Management
- Upload sessions stored in memory (use Redis in production)
- Sessions link `extractedPath` to upload metadata
- **Automatic cleanup after analysis completion**:
  - Extracted directory is deleted from filesystem
  - Upload session is removed from memory
  - Cleanup occurs both on success and error scenarios

### File Structure
- Mirrors GitHub API response format
- Recursive directory traversal
- File type detection for contracts (.rs, .sol)
- Test file identification

### Integration
- Reuses existing `GitHubService.analyzeRepository` logic
- Consistent analysis between GitHub and upload flows
- Same MongoDB storage for analysis reports

## Error Responses

```json
{
  "statusCode": 400,
  "message": "Upload session not found. Please upload files first using /uploads/discover-files"
}
```

Common error scenarios:
- File size exceeds 100MB limit
- Unsupported file format
- Corrupted or invalid archive
- Extraction failures
- Missing upload session
- Analysis errors

## Architecture Benefits

✅ **Consistent UX**: Same workflow as GitHub repository selection  
✅ **File Selection**: Users can choose which files to analyze  
✅ **Performance**: Only analyze selected files, not entire archive  
✅ **Flexibility**: Support for multiple analysis types (AI, Static)  
✅ **Session Management**: Maintains state between discovery and analysis  
✅ **Error Handling**: Comprehensive error scenarios covered