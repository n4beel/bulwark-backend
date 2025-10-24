import { Injectable } from "@nestjs/common";
import { ComplexityScores } from "./dto/static-analysis.dto";

@Injectable()
export class StaticAnalysisUtils {
    constructor() { }

    calculateTotalLinesOfCodeFactor(totalLinesOfCode: number): number {
        // 0 = 500 LOC or less, 100 = 10,000 LOC or more
        if (totalLinesOfCode <= 500) return 0;
        if (totalLinesOfCode >= 10000) return 100;
        // Linear mapping between 500 and 10,000
        return Math.round(((totalLinesOfCode - 500) / (10000 - 500)) * 100);
    }

    calculateTotalFunctionsFactor(totalFunctions: number): number {
        // 0 = 100 functions or less, 100 = 1000 functions or more
        if (totalFunctions <= 5) return 0;
        if (totalFunctions >= 300) return 100;
        // Linear mapping between 5 and 300
        return Math.round(((totalFunctions - 5) / (300 - 5)) * 100);
    }

    calculateCodeComplexityFactor(maxCyclomaticComplexity: number, avgCyclomaticComplexity: number): number {
        // Normalize Max CC to [0, 100] where 50 is mapped to 100 and capped
        const maxCCScore = Math.min(100, (maxCyclomaticComplexity / 50) * 100);
        // Normalize Avg CC to [0, 100] where 15 is mapped to 100 and capped
        const avgCCScore = Math.min(100, (avgCyclomaticComplexity / 15) * 100);

        // Weighted sum: 70% Max CC, 30% Avg CC
        const complexityFactor = 0.7 * maxCCScore + 0.3 * avgCCScore;

        // Optionally, round to two decimal places for clean reporting
        return Math.round(complexityFactor * 100) / 100;
    }
}