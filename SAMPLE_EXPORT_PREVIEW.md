# Sample Export Preview

## Based on Your Data: damm-v2-main

This is what your CSV export will look like for the report you provided. The format is **"factors as rows, reports as columns"** which makes it perfect for comparing multiple contracts.

---

## CSV Output Preview

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
Avg Cyclomatic Complexity,Structural,3.90
Max Cyclomatic Complexity,Structural,68
Composition Depth,Structural,1
Public Functions,Structural,229
Private Functions,Structural,87
Pure Functions,Structural,316
Unsafe Code Blocks,Security,0
Panic Usage,Security,0
Unwrap Usage,Security,107
Expect Usage,Security,1
Access Control Issues,Security,0
Input Validation Issues,Security,0
Integer Overflow Risks,Security,15
Match Without Default,Security,19
Custom Access Control,Security,80
Ownable Pattern,Security,0
Role Based Pattern,Security,0
CPI Usage,Integration,99
External Program Calls,Integration,0
Unique External Calls,Integration,0
Standard Libraries - Count,Integration,2
Known Protocol Interactions - Count,Integration,0
Oracle Usage - Count,Integration,0
Token Transfers,Economic,588
Complex Math Operations,Economic,140
Time-Dependent Logic,Economic,91
DeFi Patterns - Total Count,Economic,40
DeFi Patterns - AMM Count,Economic,25
DeFi Patterns - Lending Count,Economic,1
DeFi Patterns - Vesting Count,Economic,14
DeFi Patterns - Unique Types,Economic,3
Economic Risks - Total Count,Economic,16
Economic Risks - Overflow Count,Economic,9
Economic Risks - Division By Zero Count,Economic,4
Economic Risks - Precision Loss Count,Economic,3
Instruction Handlers,Anchor,59
Account Types,Anchor,101
Account Validation,Anchor,11
Seeds Usage,Anchor,25
Signer Checks,Anchor,23
Owner Checks,Anchor,75
Space Allocation,Anchor,11
Rent Exemption,Anchor,192
Program Derives - Total Count,Anchor,217
Analysis Time (ms),Performance,37317
Memory Usage (bytes),Performance,2402736
Is AMM,Economic,true
Is Lending Protocol,Economic,true
Is Vesting Contract,Economic,true
Time Dependent Logic,Economic,true
```

---

## When You Export Multiple Reports

If you have 3 contracts analyzed, the CSV will look like this:

```csv
Factor,Category,damm-v2-main,raydium-amm,popfi-staking
Repository,Basic Information,damm-v2-main,raydium-amm,popfi-staking
Total Lines of Code,Structural,7607,8234,5432
DeFi Patterns - Total Count,Economic,40,25,10
DeFi Patterns - AMM Count,Economic,25,20,5
DeFi Patterns - Lending Count,Economic,1,0,0
DeFi Patterns - Vesting Count,Economic,14,5,5
Economic Risks - Overflow Count,Economic,9,3,1
Economic Risks - Division By Zero Count,Economic,4,2,0
Economic Risks - Precision Loss Count,Economic,3,1,1
Program Derives - Total Count,Anchor,217,150,89
Unwrap Usage,Security,107,45,23
Analysis Time (ms),Performance,37317,28456,19234
```

This format allows you to:
- **Compare contracts side-by-side** (each contract is a column)
- **See trends across projects** (scan rows to compare metrics)
- **Create pivot tables** in Excel
- **Build charts** easily

---

## Excel Analysis Examples

### 1. Sort by Risk Level
You can sort the CSV to see which contracts have the most:
- Economic risks
- Overflow issues
- Unwrap usage
- Security issues

### 2. Create Comparison Charts
```
Contract Complexity Comparison:
├─ damm-v2-main:  7607 LOC, 316 functions
├─ raydium-amm:   8234 LOC, 289 functions
└─ popfi-staking: 5432 LOC, 178 functions
```

### 3. DeFi Pattern Analysis
```
DeFi Pattern Distribution:
├─ damm-v2-main:  25 AMM, 1 Lending, 14 Vesting = 40 total
├─ raydium-amm:   20 AMM, 0 Lending, 5 Vesting = 25 total
└─ popfi-staking: 5 AMM, 0 Lending, 5 Vesting = 10 total
```

### 4. Security Risk Comparison
```
Security Metrics:
                    damm-v2  raydium  popfi
Unwrap Usage:         107      45      23
Overflow Risks:         9       3       1
Access Control:        80      45      12
```

---

## Data Aggregation Benefits

### Your Original Data Had:
- 40 DeFi pattern entries (many duplicates)
- 16 economic risk factor objects
- 217 program derive instances
- Nested arrays and complex objects

### Export Provides:
✅ **5 aggregated DeFi metrics** instead of 40 raw entries  
✅ **4 aggregated risk metrics** instead of 16 raw objects  
✅ **1 derive count** instead of 217 individual entries  
✅ **Clean numbers** ready for Excel analysis  
✅ **~60 columns total** instead of 500+  

---

## How to Open and Analyze

### Method 1: Direct Excel Import
1. Save the CSV content to a file `analysis-export.csv`
2. Open in Microsoft Excel or Google Sheets
3. Data will be automatically formatted in columns

### Method 2: Excel Power Query
1. Excel → Data → From Text/CSV
2. Select the exported CSV file
3. Configure delimiter (comma)
4. Load and transform as needed

### Method 3: Programmatic Analysis
```python
import pandas as pd

# Load the CSV
df = pd.read_csv('factors-analysis-2025-10-10.csv')

# Transpose if needed (factors as columns, reports as rows)
df_transposed = df.set_index('Factor').T

# Analyze
print(df_transposed['DeFi Patterns - AMM Count'].mean())
print(df_transposed['Economic Risks - Overflow Count'].sum())
```

---

## Key Metrics at a Glance

From your damm-v2-main contract:

### 📊 **Size & Complexity**
- **7,607 lines** of code
- **316 functions** (229 public, 87 private)
- **Cyclomatic complexity:** avg 3.9, max 68

### 🔒 **Security**
- **107 unwrap()** calls (potential panic points)
- **15 integer overflow** risks
- **80 custom access control** patterns
- **0 unsafe blocks** (good!)

### 🔗 **Integration**
- **99 CPI calls** (cross-program invocations)
- **2 standard libraries** (anchor_lang, anchor_spl)
- **0 external protocols** detected

### 💰 **Economic/DeFi**
- **588 token transfers**
- **140 complex math** operations
- **25 AMM patterns** detected
- **14 vesting patterns** detected
- **1 lending pattern** detected
- **9 overflow risks** in economic logic

### ⚙️ **Anchor Features**
- **59 instruction handlers**
- **101 account types**
- **217 derive macros** used
- **75 owner checks**
- **192 rent exemption** handlers

### ⚡ **Performance**
- **37.3 seconds** analysis time
- **2.4 MB** memory usage

---

## Filename Format

The exported file will be named:
```
factors-analysis-2025-10-10-60factors-1reports.csv
```

Format: `factors-analysis-{date}-{factorCount}factors-{reportCount}reports.csv`

---

## Next Steps

1. ✅ Export functionality is ready
2. ✅ Aggregation logic is implemented
3. ✅ Default fields are configured
4. 🔄 Test the export with your data
5. 🔄 Open in Excel and verify
6. 🔄 Customize factors if needed

**Ready to test!** 🚀




