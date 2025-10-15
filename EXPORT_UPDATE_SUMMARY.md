# Export Functionality Update Summary

## What Was Updated

The CSV export functionality has been significantly enhanced to handle the new complex data structure from your smart contract analysis reports. The updates make the exported data **Excel-friendly** by intelligently aggregating repetitive array data.

## Key Changes

### 1. **Intelligent Data Aggregation**

Instead of exporting raw arrays with hundreds of duplicate entries, the system now provides meaningful aggregations:

#### DeFi Patterns
**Before:** 40 separate rows with "amm", "amm", "amm", "vesting", "vesting"...  
**After:** 
- `defiPatterns_total_count: 40`
- `defiPatterns_amm_count: 25`
- `defiPatterns_lending_count: 1`
- `defiPatterns_vesting_count: 14`
- `defiPatterns_unique_count: 3`

#### Economic Risk Factors
**Before:** 16 separate risk objects with repetitive data  
**After:**
- `economicRiskFactors_total_count: 16`
- `economicRiskFactors_overflow_count: 9`
- `economicRiskFactors_divisionByZero_count: 4`
- `economicRiskFactors_precisionLoss_count: 3`

#### Program Derives
**Before:** 217 derive macro instances listed individually  
**After:**
- `programDerives_count: 217`
- `programDerives_unique_count: 18`
- `programDerives_list: "PartialEq; Accounts; Debug; ..."`

### 2. **Updated Default Export Fields**

The default export now includes **~60 meaningful columns** covering:

✅ **Basic Info:** repository, repositoryUrl, language, framework  
✅ **Complexity Scores:** structural, security, systemic, economic  
✅ **Structural Metrics:** LOC, functions, cyclomatic complexity  
✅ **Security Metrics:** unsafe blocks, unwrap usage, access control issues  
✅ **Integration Metrics:** CPI usage, external calls, libraries, oracles  
✅ **Economic Metrics:** token transfers, math operations, DeFi patterns (aggregated)  
✅ **Risk Factors:** Economic risks (aggregated by type)  
✅ **Anchor Features:** instruction handlers, account types, derives (aggregated)  
✅ **Performance:** analysis time, memory usage  
✅ **Financial Primitives:** isAMM, isLendingProtocol, isVestingContract  

### 3. **Enhanced Category Detection**

The system now properly categorizes all new fields:
- Basic Information
- Structural
- Security
- Integration
- Economic
- Anchor
- Performance

## How to Use the Updated Export

### API Endpoint
```
POST /static-analysis/export-csv
```

### Export All Reports with Default Fields
```javascript
const response = await fetch('/static-analysis/export-csv', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({})
});

const { csv, filename } = await response.json();
// Download the CSV file
```

### Export Specific Reports
```javascript
const response = await fetch('/static-analysis/export-csv', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    reportIds: ['68e79d4c2bd1609057b93133', '68e79d4c2bd1609057b93134']
  })
});

const { csv, filename } = await response.json();
```

### Export with Custom Fields
```javascript
const response = await fetch('/static-analysis/export-csv', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    factors: [
      'repository',
      'scores.structural.score',
      'scores.security.score',
      'defiPatterns_total_count',
      'defiPatterns_amm_count',
      'economicRiskFactors_overflow_count',
      'analysisFactors.unwrapUsage',
      'programDerives_count'
    ]
  })
});

const { csv, filename } = await response.json();
```

### cURL Example
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{}' \
  http://localhost:3000/static-analysis/export-csv
```

## Export Format

The CSV is exported in **"factors as rows, reports as columns"** format:

```csv
Factor,Category,damm-v2-main,raydium-amm,another-contract
Repository,Basic Information,damm-v2-main,raydium-amm,another-contract
Total Lines of Code,Structural,7607,8234,5432
DeFi Patterns - Total Count,Economic,40,25,10
DeFi Patterns - AMM Count,Economic,25,20,5
Economic Risks - Overflow Count,Economic,9,3,1
Program Derives - Total Count,Anchor,217,150,89
```

This format is perfect for:
- Comparing multiple contracts side-by-side
- Creating pivot tables in Excel
- Building charts and visualizations
- Identifying patterns across contracts

## New Aggregated Factors Available

### DeFi Patterns
- `defiPatterns_total_count`
- `defiPatterns_amm_count`
- `defiPatterns_lending_count`
- `defiPatterns_vesting_count`
- `defiPatterns_unique_count`

### Economic Risks
- `economicRiskFactors_total_count`
- `economicRiskFactors_overflow_count`
- `economicRiskFactors_divisionByZero_count`
- `economicRiskFactors_precisionLoss_count`

### Program Derives
- `programDerives_count`
- `programDerives_unique_count`

### Libraries & Integrations
- `standardLibraryUsage_count`
- `knownProtocolInteractions_count`
- `oracleUsage_count`
- `crossProgramInvocation_count`

## Benefits

### ✅ Excel-Friendly
- Manageable column count (~60 vs 500+)
- No repetitive data
- Clean, analysis-ready format

### ✅ Meaningful Insights
- Aggregated metrics provide clear picture
- Easy to spot trends and patterns
- Compare contracts effectively

### ✅ Flexible
- Export all or specific reports
- Choose which factors to include
- Custom field selection supported

### ✅ No Data Loss
- All important information preserved
- Aggregations maintain accuracy
- Detailed lists available when needed (semicolon-separated)

## Testing the Export

1. **Start your server:**
   ```bash
   npm run start:dev
   ```

2. **Test with curl:**
   ```bash
   curl -X POST \
     -H "Content-Type: application/json" \
     -d '{}' \
     http://localhost:3000/static-analysis/export-csv
   ```

3. **Check the response:**
   - You'll get a JSON with `csv` (the CSV content) and `filename`
   - Save the CSV content to a file
   - Open in Excel/Google Sheets

4. **Verify the data:**
   - Check that aggregated fields show correct counts
   - Verify defiPatterns_amm_count matches your expectations
   - Confirm economicRiskFactors are properly categorized

## Example Data Transformation

Given your sample data with:
- 40 DeFi patterns (many duplicates)
- 16 economic risk factors
- 217 program derives
- Standard libraries: ["anchor_lang", "anchor_spl"]

**Export will show:**
```csv
Factor,Category,damm-v2-main
Repository,Basic Information,damm-v2-main
Repository URL,Basic Information,uploaded://damm-v2-main.zip
Language,Basic Information,rust
Framework,Basic Information,unknown
Structural Score,Complexity Scores,100
Security Score,Complexity Scores,100
Systemic Score,Complexity Scores,100
Economic Score,Complexity Scores,100
Total Lines of Code,Structural,7607
Number of Functions,Structural,316
Number of Programs,Structural,1
...
DeFi Patterns - Total Count,Economic,40
DeFi Patterns - AMM Count,Economic,25
DeFi Patterns - Lending Count,Economic,1
DeFi Patterns - Vesting Count,Economic,14
DeFi Patterns - Unique Types,Economic,3
Economic Risks - Total Count,Economic,16
Economic Risks - Overflow Count,Economic,9
Economic Risks - Division By Zero Count,Economic,4
Economic Risks - Precision Loss Count,Economic,3
Program Derives - Total Count,Anchor,217
Standard Libraries - Count,Integration,2
...
```

## Files Modified

1. **`src/static-analysis/static-analysis.service.ts`**
   - Updated `getDefaultFactors()` - Added ~60 meaningful default fields
   - Enhanced `extractArraySummary()` - Added intelligent aggregation logic
   - Updated `getAvailableFactors()` - Added metadata for new aggregated fields
   - Improved `createFriendlyName()` - Better handling of factor names
   - Enhanced `inferCategory()` - Proper categorization of new fields

2. **`ANALYTICS_README.md`**
   - Added comprehensive documentation of new aggregated factors
   - Included examples and benefits
   - Updated usage instructions

## Next Steps

1. **Test the export** with your existing data
2. **Open the CSV in Excel** to verify the format
3. **Customize the factors** if needed for your specific use case
4. **Integrate with your frontend** to provide export functionality to users

## Support

If you need to add more aggregations or modify the export format, the key methods to update are:

1. `getDefaultFactors()` - Add/remove default fields
2. `extractArraySummary()` - Add new aggregation logic
3. `getAvailableFactors()` - Add metadata for new fields

All changes are backward compatible - existing reports will continue to work!




