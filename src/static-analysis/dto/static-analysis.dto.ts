export class StaticAnalysisDto {
  owner: string;
  repo: string;
  accessToken: string;
  selectedFiles?: string[];
  analysisOptions?: {
    includeTests?: boolean;
    includeDependencies?: boolean;
    depth?: 'shallow' | 'medium' | 'deep';
  };
}

export interface RustAnalysisFactors {
  // Layer 1: Structural Complexity
  totalLinesOfCode: number;
  numPrograms: number;
  numFunctions: number;
  numStateVariables: number;
  avgCyclomaticComplexity: number;
  maxCyclomaticComplexity: number;
  compositionDepth: number;
  functionVisibility: {
    public: number;
    private: number;
    internal: number;
  };
  viewFunctions: number;
  pureFunctions: number;

  // Layer 2: Security Complexity (Rust-specific)
  integerOverflowRisks: number;
  accessControlIssues: number;
  inputValidationIssues: number;
  unsafeCodeBlocks: number;
  panicUsage: number;
  unwrapUsage: number;
  expectUsage: number;
  matchWithoutDefault: number;
  arrayBoundsChecks: number;
  memorySafetyIssues: number;

  // Layer 3: Systemic & Integration Complexity
  externalProgramCalls: number;
  uniqueExternalCalls: number;
  knownProtocolInteractions: string[];
  standardLibraryUsage: string[];
  oracleUsage: OracleUsage[];
  accessControlPatterns: {
    ownable: number;
    roleBased: number;
    custom: number;
  };
  cpiUsage: number;
  crossProgramInvocation: CrossProgramInvocation[];

  // Layer 4: Economic & Functional Complexity
  tokenTransfers: number;
  complexMathOperations: number;
  timeDependentLogic: number;
  defiPatterns: DeFiPattern[];
  economicRiskFactors: EconomicRiskFactor[];
  anchorSpecificFeatures: AnchorSpecificFeatures;
}

export interface OracleUsage {
  oracle: string;
  functions: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

export interface CrossProgramInvocation {
  targetProgram: string;
  functions: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

export interface DeFiPattern {
  type:
  | 'amm'
  | 'lending'
  | 'oracle'
  | 'token_transfer'
  | 'vesting'
  | 'staking'
  | 'yield_farming';
  complexity: 'low' | 'medium' | 'high';
  riskLevel: 'low' | 'medium' | 'high';
}

export interface EconomicRiskFactor {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  count: number;
  weight: number;
}

export interface AnchorSpecificFeatures {
  accountValidation: number;
  constraintUsage: number;
  instructionHandlers: number;
  programDerives: string[];
  accountTypes: number;
  seedsUsage: number;
  bumpUsage: number;
  signerChecks: number;
  ownerChecks: number;
  spaceAllocation: number;
  rentExemption: number;
}

export interface ComplexityScores {
  structural: {
    score: number;
    details: {
      totalLinesOfCode: number;
      numContracts: number;
      numFunctions: number;
      numStateVariables: number;
      avgCyclomaticComplexity: number;
      maxCyclomaticComplexity: number;
      inheritanceDepth: number;
    };
  };
  security: {
    score: number;
    details: {
      lowLevelOperations: {
        assemblyBlocks: number;
        delegateCalls: number;
        rawCalls: number;
      };
      securityCriticalFeatures: {
        payableFunctions: number;
        txOriginUsage: number;
        selfDestructCalls: number;
        isProxyContract: boolean;
      };
      riskFactors: EconomicRiskFactor[];
    };
  };
  systemic: {
    score: number;
    details: {
      externalDependencies: {
        externalContractCalls: number;
        uniqueFunctionCallsExternal: number;
        knownProtocolInteractions: string[];
      };
      standardInteractions: {
        erc20Interactions: boolean;
        erc721Interactions: boolean;
        erc1155Interactions: boolean;
      };
      oracleUsage: OracleUsage[];
      accessControlPattern: {
        type: string;
        complexity: string;
      };
    };
  };
  economic: {
    score: number;
    details: {
      financialPrimitives: {
        isAMM: boolean;
        isLendingProtocol: boolean;
        isVestingContract: boolean;
        defiPatterns: DeFiPattern[];
      };
      tokenomics: {
        tokenTransfers: number;
        complexMathOperations: number;
        timeDependentLogic: boolean;
      };
      economicRiskFactors: EconomicRiskFactor[];
    };
  };
}

export interface StaticAnalysisReport {
  _id?: string;
  repository: string;
  repositoryUrl: string;
  language: string;
  framework: string;

  // Analysis metadata
  analysis_engine?: string;
  analyzer_version?: string;
  analysis_date?: string;

  // TypeScript analysis results
  typescript_analysis?: {
    engine: string;
    version: string;
    success: boolean;
    analysisFactors: any;
    scores: any;
    total_lines_of_code: number;
    total_functions: number;
    complex_math_operations: number;
  };

  // Rust analysis results
  rust_analysis?: {
    engine: string;
    version: string;
    success: boolean;
    error: string | null;
    analysisFactors: any;
    total_lines_of_code: number;
    total_functions: number;
  };

  // AI analysis results
  ai_analysis?: {
    engine: string;
    version: string;
    success: boolean;
    error: string | null;
    analysisFactors: any;
    documentation_clarity: number;
    testing_coverage: number;
    financial_logic_complexity: number;
    attack_vector_risk: number;
    value_at_risk: number;
  };

  // Analysis comparison
  analysis_comparison?: {
    lines_of_code_diff: number;
    functions_diff: number;
    math_operations_diff: number;
    accuracy_notes: string[];
  } | {
    error: string;
    fallback_used: string;
  };

  performance: {
    analysisTime: number;
    memoryUsage: number;
    typescript_analysis_included?: boolean;
    rust_analysis_success?: boolean;
  };

  // User association - optional, reports may or may not have a userId
  userId?: string;

  // Commit information
  commitHash?: string;
  commitUrl?: string;

  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

export interface StaticAnalysisReportDocument extends StaticAnalysisReport {
  _id: string;
  __v: number;
}
