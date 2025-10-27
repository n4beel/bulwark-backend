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

    calculateTotalScore(staticAnalysisScores: any): any {
        const structuralScore = (
            staticAnalysisScores.structural.loc_factor * 0.25 +
            staticAnalysisScores.structural.total_functions_factor * 0.25 +
            staticAnalysisScores.structural.code_complexity_factor * 0.20 +
            staticAnalysisScores.structural.modularity_factor * 0.15 +
            staticAnalysisScores.structural.dependency_security_factor * 0.15
        );

        const securityScore = (
            staticAnalysisScores.security.access_control_factor * 0.20 +
            staticAnalysisScores.security.pda_complexity_factor * 0.15 +
            staticAnalysisScores.security.cpi_factor * 0.15 +
            staticAnalysisScores.security.input_constraints_factor * 0.15 +
            staticAnalysisScores.security.arithmatic_factor * 0.10 +
            staticAnalysisScores.security.priviliged_roles_factor * 0.10 +
            staticAnalysisScores.security.unsafe_lowlevel_factor * 0.10 +
            staticAnalysisScores.security.error_handling_factor * 0.05
        );
        const systemicScore = (
            staticAnalysisScores.systemic.upgradeability_factor * 0.20 +
            staticAnalysisScores.systemic.external_integration_factor * 0.30 +
            staticAnalysisScores.systemic.composability_factor * 0.20 +
            staticAnalysisScores.systemic.dos_resource_limits_factor * 0.15 +
            staticAnalysisScores.systemic.operational_security_factor * 0.15
        );
        const economicScore = (
            staticAnalysisScores.economic.asset_types_factor * 0.50 +
            staticAnalysisScores.economic.invariants_risk_factor * 0.50
        );
        const totalScore = (
            structuralScore * 0.20 +
            securityScore * 0.30 +
            systemicScore * 0.30 +
            economicScore * 0.20
        );

        return {
            structural: structuralScore,
            security: securityScore,
            systemic: systemicScore,
            economic: economicScore,
            total: totalScore,
        }
    }
}