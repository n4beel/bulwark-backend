# Analytics Module

This module provides analytics capabilities for static analysis reports, allowing users to export data in CSV format and discover available factors for analysis.

## Features

- **CSV Export**: Export analysis reports in flat CSV structure
- **Selective Export**: Choose specific reports and factors to include
- **Factor Discovery**: Get all available factors with metadata
- **Flexible Filtering**: Support for report ID and factor filtering

## API Endpoints

### 1. POST /static-analysis/export-csv

Export analysis reports to CSV format with optional filtering.

**Request:**
- Method: `POST`
- Content-Type: `application/json`
- Body:
```json
{
  "reportIds": ["report1", "report2"],  // Optional: specific report IDs
  "factors": ["repository", "scores.overall", "analysisFactors.structuralComplexity.totalLinesOfCode"]  // Optional: specific factors
}
```

**Response:**
```json
{
  "csv": "Repository,Overall Score,Total Lines of Code\nmy-contract,75,1250\n...",
  "filename": "static-analysis-export-2024-01-01-2reports-3factors.csv"
}
```

### 2. POST /static-analysis/available-factors

Get all available factors with comprehensive metadata.

**Request:**
- Method: `POST`
- Content-Type: `application/json`
- Body: `{}` (empty body)

**Response:**
```json
{
  "basic": {
    "category": "Basic Information",
    "description": "Basic report metadata and identifiers",
    "factors": {
      "_id": {
        "name": "Report ID",
        "type": "string",
        "description": "Unique identifier for the analysis report"
      },
      "repository": {
        "name": "Repository",
        "type": "string",
        "description": "Name of the analyzed repository"
      }
    }
  },
  "scores": {
    "category": "Complexity Scores",
    "description": "Overall complexity scores for each category",
    "factors": {
      "scores.structural": {
        "name": "Structural Score",
        "type": "number",
        "description": "Overall structural complexity score (0-100)"
      }
    }
  }
}
```

## Factor Categories

### 📊 **Basic Information**
- `_id` - Report ID
- `repository` - Repository name
- `repositoryUrl` - Repository URL
- `language` - Programming language
- `framework` - Framework used
- `createdAt` - Analysis date
- `updatedAt` - Last updated

### 🎯 **Complexity Scores**
- `scores.structural` - Structural complexity (0-100)
- `scores.semantic` - Semantic & security complexity (0-100)
- `scores.systemic` - Systemic & integration complexity (0-100)
- `scores.economic` - Economic & functional complexity (0-100)
- `scores.overall` - Overall complexity score (0-100)

### 🏗️ **Structural Complexity Factors**
- `analysisFactors.structuralComplexity.totalLinesOfCode` - Total lines of code
- `analysisFactors.structuralComplexity.numFunctions` - Number of functions
- `analysisFactors.structuralComplexity.numPrograms` - Number of programs
- `analysisFactors.structuralComplexity.numStateVariables` - State variables
- `analysisFactors.structuralComplexity.avgCyclomaticComplexity` - Average cyclomatic complexity
- `analysisFactors.structuralComplexity.maxCyclomaticComplexity` - Maximum cyclomatic complexity
- `analysisFactors.structuralComplexity.totalCyclomaticComplexity` - Total cyclomatic complexity
- `analysisFactors.structuralComplexity.instructionHandlers` - Instruction handlers
- `analysisFactors.structuralComplexity.nestedDepth` - Maximum nesting depth

### 🔒 **Semantic & Security Complexity Factors**
- `analysisFactors.semanticComplexity.unsafeCodeBlocks` - Unsafe code blocks
- `analysisFactors.semanticComplexity.memorySafetyIssues` - Memory safety issues
- `analysisFactors.semanticComplexity.accessControlIssues` - Access control issues
- `analysisFactors.semanticComplexity.panicUsage` - Panic usage
- `analysisFactors.semanticComplexity.unwrapUsage` - Unwrap usage
- `analysisFactors.semanticComplexity.errorHandlingPatterns` - Error handling patterns
- `analysisFactors.semanticComplexity.inputValidation` - Input validation

### 🔗 **Systemic & Integration Complexity Factors**
- `analysisFactors.systemicComplexity.externalProgramCalls` - External program calls
- `analysisFactors.systemicComplexity.uniqueExternalCalls` - Unique external calls
- `analysisFactors.systemicComplexity.cpiUsage` - CPI usage
- `analysisFactors.systemicComplexity.constraintUsage` - Constraint usage
- `analysisFactors.systemicComplexity.oracleUsage` - Oracle usage (array)
- `analysisFactors.systemicComplexity.crossProgramInvocations` - Cross-program invocations (array)

### 💰 **Economic & Functional Complexity Factors**
- `analysisFactors.economicComplexity.tokenTransfers` - Token transfers
- `analysisFactors.economicComplexity.complexMathOperations` - Complex math operations
- `analysisFactors.economicComplexity.timeDependentLogic` - Time-dependent logic
- `analysisFactors.economicComplexity.defiPatterns` - DeFi patterns (array)
- `analysisFactors.economicComplexity.economicRiskFactors` - Economic risk factors (array)

### ⚓ **Anchor-Specific Features**
- `analysisFactors.anchorSpecificFeatures.accountValidation` - Account validation
- `analysisFactors.anchorSpecificFeatures.seedsUsage` - Seeds usage
- `analysisFactors.anchorSpecificFeatures.bumpsUsage` - Bumps usage
- `analysisFactors.anchorSpecificFeatures.spaceMacroUsage` - Space macro usage
- `analysisFactors.anchorSpecificFeatures.eventEmission` - Event emission

### ⚡ **Performance Metrics**
- `performance.analysisTime` - Analysis time (ms)
- `performance.memoryUsage` - Memory usage (bytes)

## Usage Examples

### Export All Reports with All Factors

```javascript
const response = await fetch('/static-analysis/export-csv', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({})
});

const { csv, filename } = await response.json();
// Download or save the CSV content
```

### Export Specific Reports with Selected Factors

```javascript
const response = await fetch('/static-analysis/export-csv', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    reportIds: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
    factors: [
      'repository',
      'scores.overall',
      'analysisFactors.structuralComplexity.totalLinesOfCode',
      'analysisFactors.semanticComplexity.unsafeCodeBlocks'
    ]
  })
});

const { csv, filename } = await response.json();
```

### Get Available Factors for UI Building

```javascript
const response = await fetch('/static-analysis/available-factors', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({})
});

const factors = await response.json();
// Use factors to build dynamic UI for factor selection
```

### cURL Examples

```bash
# Export all reports with all factors
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{}' \
  http://localhost:3000/static-analysis/export-csv

# Export specific reports with selected factors
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "reportIds": ["507f1f77bcf86cd799439011"],
    "factors": ["repository", "scores.overall"]
  }' \
  http://localhost:3000/static-analysis/export-csv

# Get available factors
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{}' \
  http://localhost:3000/static-analysis/available-factors
```

## CSV Output Format

The CSV output uses a **practical flattened structure** with one row per report and **meaningful aggregated columns**:

```csv
Repository,Scores Overall,Analysis Factors Structural Complexity Total Lines Of Code,Analysis Factors Semantic Complexity Unsafe Code Blocks,Analysis Factors Economic Complexity Defi Patterns Count,Analysis Factors Economic Complexity Defi Patterns Types,Analysis Factors Economic Complexity Defi Patterns Confidence Avg
my-solana-contract,75,1250,2,2,"amm; lending",0.885
defi-protocol,88,3400,0,1,lending,0.92
nft-marketplace,62,2100,1,0,,
```

### Improved Flattening Strategy

#### **Simple Objects** (Only Primitive Values)
```json
// Original nested structure
{
  "scores": {
    "structural": 45,
    "semantic": 62,
    "overall": 54
  }
}

// Becomes individual columns
scores.structural = 45
scores.semantic = 62  
scores.overall = 54
```

#### **String Arrays** → Joined Lists
```json
// Original array
{
  "knownProtocols": ["Uniswap", "Aave", "Compound"]
}

// Becomes practical columns
knownProtocols_count = 3
knownProtocols_list = "Uniswap; Aave; Compound"
```

#### **Number Arrays** → Statistics
```json
// Original array
{
  "riskScores": [0.2, 0.8, 0.5]
}

// Becomes statistical columns
riskScores_count = 3
riskScores_sum = 1.5
riskScores_avg = 0.5
riskScores_max = 0.8
riskScores_min = 0.2
```

#### **Object Arrays** → Smart Aggregation
```json
// Original array structure
{
  "defiPatterns": [
    { "type": "amm", "confidence": 0.85 },
    { "type": "lending", "confidence": 0.92 }
  ]
}

// Becomes aggregated columns
defiPatterns_count = 2
defiPatterns_types = "amm; lending"
defiPatterns_confidence_avg = 0.885
defiPatterns_confidence_max = 0.92
```

#### **Complex Objects** → Summary Statistics
```json
// Original complex object
{
  "complexObject": {
    "prop1": 10,
    "prop2": 20,
    "nested": { "deep": "value" }
  }
}

// Becomes summary columns
complexObject_keys_count = 3
complexObject_numeric_sum = 30
complexObject_numeric_avg = 15
```

### Data Type Handling

- **Numbers**: Output as-is (no quotes)
- **Strings**: Quoted only if containing commas/quotes/newlines  
- **Booleans**: Output as 'true' or 'false'
- **String Arrays**: Joined with '; ' separator
- **Number Arrays**: Statistical aggregations (sum, avg, max, min)
- **Object Arrays**: Extract key properties and aggregate
- **Complex Objects**: Summary statistics
- **Null/Undefined**: Empty string

### Column Naming

- **Underscores for suffixes**: `defiPatterns_count`, `confidence_avg`
- **CamelCase conversion**: `totalLinesOfCode` → `Total Lines Of Code`
- **Clean formatting**: `analysisFactors.economicComplexity.defiPatterns_types` → `Analysis Factors Economic Complexity Defi Patterns Types`

### Benefits of This Approach

✅ **Manageable Column Count**: ~50-100 columns instead of 500+  
✅ **Meaningful Aggregations**: Focus on actionable insights  
✅ **Excel-Friendly**: Reasonable number of columns for spreadsheet analysis  
✅ **No Data Loss**: All important information preserved in aggregated form  
✅ **Analysis-Ready**: Perfect for pivot tables and charts

## Implementation Details

### Flexible Filtering
- **No reportIds**: Export all reports from database
- **No factors**: Include all available factors
- **Specific reportIds**: Filter by MongoDB `_id` field
- **Specific factors**: Use dot notation for nested properties

### Performance Considerations
- Efficient MongoDB queries with `$in` operator
- Streaming-friendly CSV generation
- Memory-efficient processing for large datasets

### Error Handling
- Invalid report IDs: Returns error with details
- No reports found: Clear error message
- Invalid factors: Gracefully handles missing properties
- Database errors: Proper error propagation

## New Aggregated Factors (Excel-Friendly)

The export functionality now includes intelligent aggregation of complex array data to make Excel analysis more manageable. Instead of thousands of repetitive rows, data is aggregated into meaningful metrics.

### 📈 DeFi Pattern Aggregations

For contracts with multiple DeFi patterns (e.g., 40 instances of AMM patterns), instead of listing each one, we provide:

- `defiPatterns_total_count` - Total number of DeFi pattern instances
- `defiPatterns_amm_count` - Number of AMM (Automated Market Maker) patterns
- `defiPatterns_lending_count` - Number of lending protocol patterns  
- `defiPatterns_vesting_count` - Number of vesting contract patterns
- `defiPatterns_unique_count` - Number of unique pattern types
- `defiPatterns_types` - Semicolon-separated list of all types

**Example:**
```
defiPatterns_total_count: 40
defiPatterns_amm_count: 25
defiPatterns_lending_count: 1
defiPatterns_vesting_count: 14
defiPatterns_unique_count: 3
```

### ⚠️ Economic Risk Factor Aggregations

Economic risks are aggregated by type for clearer analysis:

- `economicRiskFactors_total_count` - Total number of economic risks
- `economicRiskFactors_overflow_count` - Integer overflow risks
- `economicRiskFactors_divisionByZero_count` - Division by zero risks
- `economicRiskFactors_precisionLoss_count` - Precision loss risks
- `economicRiskFactors_severities` - List of severity levels

**Example:**
```
economicRiskFactors_total_count: 16
economicRiskFactors_overflow_count: 9
economicRiskFactors_divisionByZero_count: 4
economicRiskFactors_precisionLoss_count: 3
```

### 🔧 Anchor Program Derives Aggregations

Instead of listing hundreds of derive macro instances:

- `programDerives_count` - Total number of derive macros used
- `programDerives_unique_count` - Number of unique derive types
- `programDerives_list` - Semicolon-separated list of unique derives

**Example:**
```
programDerives_count: 217
programDerives_unique_count: 18
programDerives_list: PartialEq; Accounts; AnchorSerialize; AnchorDeserialize; Debug; Clone; Copy; ...
```

### 📚 Library and Integration Aggregations

- `standardLibraryUsage_count` - Number of standard libraries
- `standardLibraryUsage_list` - List of libraries (e.g., "anchor_lang; anchor_spl")
- `knownProtocolInteractions_count` - Number of protocol integrations
- `oracleUsage_count` - Number of oracle integrations
- `crossProgramInvocation_count` - Number of CPI calls

### ✅ Benefits of Aggregated Export

**Before (Old Approach):**
- 500+ columns with repetitive data
- Excel becomes unmanageable
- Difficult to analyze trends
- Lost in the details

**After (New Approach):**
- ~60 meaningful columns
- Excel-friendly format
- Clear aggregated metrics
- Analysis-ready data
- Perfect for pivot tables and charts

### 🎯 Default Export Includes

When no specific factors are requested, the export includes:

**Basic Info:** repository, repositoryUrl, language, framework

**Scores:** structural, security, systemic, economic

**Structural:** LOC, functions, programs, cyclomatic complexity

**Security:** unsafe blocks, panic/unwrap usage, access control issues

**Integration:** CPI usage, external calls, oracle usage, standard libraries

**Economic:** token transfers, complex math, DeFi patterns (aggregated), economic risks (aggregated)

**Anchor:** instruction handlers, account types, seeds, signer/owner checks, derives (aggregated)

**Performance:** analysis time, memory usage

**Financial Primitives:** isAMM, isLendingProtocol, isVestingContract

## Frontend Integration

This analytics API is designed to support rich frontend experiences:

1. **Factor Discovery**: Use `/available-factors` to build dynamic UI
2. **Report Selection**: Get all reports, let users select which to export
3. **Factor Selection**: Present categorized factor lists with descriptions
4. **CSV Download**: Generate and download CSV files with meaningful names

The comprehensive metadata enables building intuitive analytics dashboards! 📊✨
