# AI Integration for Audit Estimation

This document describes the AI integration feature that uses OpenAI to generate intelligent audit estimates based on repository analysis.

## Overview

The AI service leverages OpenAI's GPT-4 to provide expert-level audit estimates, including:
- **Duration estimates** with detailed reasoning
- **Cost estimates** based on current market rates
- **Resource allocation** recommendations
- **Risk factor identification**
- **Special considerations** for the specific codebase

## Features

### 🤖 AI-Powered Estimation
- Uses OpenAI GPT-4 for intelligent analysis
- Provides detailed reasoning for all estimates
- Considers framework-specific complexities
- Accounts for current industry standards

### 🔄 Fallback Mechanism
- Falls back to internal calculation if AI is unavailable
- Graceful degradation when OpenAI API is down
- Maintains functionality even without AI

### 📊 Enhanced Reporting
- Risk factor identification
- Special considerations for each project
- Detailed reasoning for all estimates
- Professional-grade audit recommendations

## Configuration

### Environment Variables

Add these to your `.env` file:

```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
AI_MODEL=gpt-4-turbo-preview
AI_MAX_TOKENS=2000
AI_TEMPERATURE=0.3
```

### API Key Setup

1. Get your OpenAI API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. Add it to your environment variables
3. The service will automatically detect and use the AI features

## Usage

### Backend Integration

The AI service is automatically integrated into the scoping engine:

```typescript
// The scoping service automatically uses AI when available
const report = await scopingService.generatePreAuditReport(
  owner, 
  repo, 
  accessToken, 
  selectedFiles
);

// AI-generated estimates include:
console.log(report.auditEstimate.duration.reasoning);
console.log(report.auditEstimate.cost.reasoning);
console.log(report.auditEstimate.riskFactors);
console.log(report.auditEstimate.specialConsiderations);
```

### Frontend Display

The frontend automatically displays AI insights in a new "AI Insights" tab:

- **Duration Reasoning**: Detailed explanation of timeline estimates
- **Cost Reasoning**: Market-based cost analysis
- **Resource Reasoning**: Team allocation justification
- **Risk Factors**: Key security concerns identified
- **Special Considerations**: Project-specific recommendations

## AI Prompt Engineering

The AI service uses carefully crafted prompts to ensure:

### Expert Context
- Positions AI as a 15+ year security auditor
- Provides context about blockchain platforms
- Includes industry experience references

### Structured Output
- Enforces JSON response format
- Validates and sanitizes AI responses
- Provides fallback values for missing fields

### Comprehensive Analysis
- Framework-specific considerations
- Dependency analysis
- Test coverage evaluation
- Platform-specific risks

## Testing

### Test AI Integration

```bash
# Test the AI service
node test-ai.js
```

### Manual Testing

1. Set your OpenAI API key
2. Start the server: `npm run start:dev`
3. Use the frontend to analyze a repository
4. Check the "AI Insights" tab for AI-generated content

## Error Handling

### AI Service Unavailable
- Graceful fallback to internal calculation
- Warning logs for debugging
- No impact on core functionality

### API Errors
- Detailed error logging
- User-friendly error messages
- Automatic retry mechanisms

### Response Validation
- JSON parsing validation
- Field existence checks
- Type safety enforcement

## Performance Considerations

### Token Usage
- Optimized prompts to minimize token usage
- Configurable max tokens limit
- Efficient response parsing

### Response Time
- Async processing to avoid blocking
- Timeout handling for API calls
- Caching considerations for future

### Cost Management
- Configurable temperature for consistency
- Token limit controls
- Usage monitoring capabilities

## Security

### API Key Protection
- Environment variable storage
- No hardcoded credentials
- Secure configuration management

### Input Validation
- Repository data sanitization
- Prompt injection prevention
- Response validation

## Future Enhancements

### Planned Features
- [ ] Fine-tuned models for specific frameworks
- [ ] Historical data integration
- [ ] Multi-model support (Claude, etc.)
- [ ] Batch processing capabilities
- [ ] Advanced prompt templates

### Potential Improvements
- [ ] Caching for similar repositories
- [ ] Learning from user feedback
- [ ] Custom model training
- [ ] Integration with security databases

## Troubleshooting

### Common Issues

**AI not working**
- Check OpenAI API key configuration
- Verify API key has sufficient credits
- Check network connectivity

**Poor estimates**
- Adjust temperature setting
- Review prompt engineering
- Check input data quality

**Slow responses**
- Reduce max tokens
- Optimize prompt length
- Consider caching strategies

### Debug Mode

Enable detailed logging:

```typescript
// In AI service
this.logger.debug('AI prompt:', prompt);
this.logger.debug('AI response:', response);
```

## Support

For issues with the AI integration:

1. Check the logs for detailed error messages
2. Verify OpenAI API key and configuration
3. Test with the provided test script
4. Review the fallback mechanism is working

The AI integration enhances the scoping engine with expert-level insights while maintaining reliability through fallback mechanisms.
