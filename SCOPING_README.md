# 🔍 Scoping Engine

The Scoping Engine is the core component of MySecurity that analyzes GitHub repositories and generates pre-audit reports with estimates for duration, resources, and cost.

## 🚀 Features

- **Repository Analysis**: Clones and analyzes GitHub repositories
- **Metadata Extraction**: Extracts lines of code, contract count, dependencies, framework detection
- **Complexity Assessment**: Determines project complexity (low/medium/high)
- **Audit Estimation**: Calculates estimated duration, required resources, and cost
- **Risk Identification**: Identifies potential risk areas
- **Recommendations**: Provides actionable recommendations

## 📋 API Endpoints

### Generate Pre-Audit Report
```http
POST /scoping/generate-report
Content-Type: application/json

{
  "owner": "github-username",
  "repo": "repository-name", 
  "accessToken": "github-personal-access-token"
}
```

**Response:**
```json
{
  "projectName": "example-protocol",
  "repositoryInfo": {
    "name": "example-protocol",
    "fullName": "username/example-protocol",
    "description": "A sample smart contract protocol",
    "language": "Solidity",
    "size": 1024,
    "private": false
  },
  "analysis": {
    "totalLines": 6300,
    "solidityFiles": 12,
    "contractFiles": ["contracts/Token.sol", "contracts/Staking.sol"],
    "dependencies": ["@openzeppelin/contracts", "hardhat"],
    "framework": "hardhat",
    "testFiles": 8,
    "complexity": "medium"
  },
  "auditEstimate": {
    "duration": {
      "min": 12,
      "max": 18,
      "unit": "days"
    },
    "resources": {
      "seniorAuditors": 1,
      "juniorAuditors": 1
    },
    "cost": {
      "min": 20000,
      "max": 35000,
      "currency": "USD"
    }
  },
  "riskAreas": [
    "Proxy patterns and upgradeability risks",
    "Reentrancy attack vectors"
  ],
  "recommendations": [
    "Increase test coverage before audit",
    "Review upgrade patterns and proxy implementations"
  ],
  "generatedAt": "2024-01-15T10:30:00.000Z"
}
```

### Health Check
```http
POST /scoping/health
```

## 🛠️ Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   Create a `.env` file based on `env.example`:
   ```env
   PORT=3000
   NODE_ENV=development
   ```

3. **Start the Server**
   ```bash
   npm run start:dev
   ```

## 🧪 Testing

### Test the Scoping Engine
```bash
# Test health endpoint only
node test-scoping.js

# Test with real repository (requires GitHub token)
node test-scoping.js <github_token> <owner> <repo>
```

### Example with Real Repository
```bash
node test-scoping.js ghp_xxxxxxxxxxxxxxxxxxxx n4beel example-protocol
```

## 📊 Analysis Algorithm

### Complexity Calculation
The engine determines complexity based on:
- **Lines of Code**: <1k (low), 1k-5k (medium), >5k (high)
- **Contract Count**: <5 (low), 5-15 (medium), >15 (high)  
- **Dependencies**: <5 (low), 5-10 (medium), >10 (high)

### Cost Estimation
Base costs by complexity:
- **Low**: $8,000 (5 days)
- **Medium**: $25,000 (15 days) 
- **High**: $50,000 (30 days)

Additional factors:
- Contract count adjustments
- Dependency multiplier
- ±20% variance for estimates

## 🔧 Framework Detection

Supported frameworks:
- **Hardhat**: `hardhat.config.js/ts`
- **Truffle**: `truffle-config.js`
- **Foundry**: `foundry.toml`
- **Brownie**: `brownie-config.yaml`
- **Embark**: `embark.json`

## 📁 File Structure

```
src/
├── github/
│   ├── github.service.ts    # GitHub API integration
│   └── github.module.ts     # GitHub module
├── scoping/
│   ├── scoping.service.ts   # Core scoping logic
│   ├── scoping.controller.ts # API endpoints
│   └── scoping.module.ts    # Scoping module
└── app.module.ts            # Main app module
```

## 🔒 Security Notes

- **Access Tokens**: Never commit GitHub tokens to version control
- **Repository Access**: Only public repositories or those with proper permissions
- **Temporary Files**: Repositories are cloned to `temp/repos/` and cleaned up after analysis

## 🚧 Next Steps

1. **Add Authentication**: Implement proper user authentication
2. **Database Integration**: Store reports and analysis history
3. **Advanced Analysis**: Integrate security tools (Slither, MythX)
4. **AI Enhancement**: Add GPT/Claude integration for better insights
5. **Auditor Feedback**: Collect and incorporate auditor feedback

## 🐛 Troubleshooting

### Common Issues

1. **Repository Not Found**
   - Check repository name and owner
   - Verify access token has proper permissions
   - Ensure repository is public or token has access

2. **Git Clone Failed**
   - Check internet connection
   - Verify repository URL is accessible
   - Ensure sufficient disk space in temp directory

3. **Analysis Failed**
   - Check if repository contains Solidity files
   - Verify file permissions in temp directory
   - Check server logs for specific errors

### Debug Mode
Enable debug logging by setting `NODE_ENV=development` in your `.env` file.
