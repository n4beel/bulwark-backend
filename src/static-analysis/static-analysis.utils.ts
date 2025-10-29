import { Injectable } from "@nestjs/common";
import { ComplexityScores } from "./dto/static-analysis.dto";
import { AiAnalysisResults, CodeMetrics } from "src/ai-analysis/ai-analysis.service";

@Injectable()
export class StaticAnalysisUtils {
    constructor() { }

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

    calculateResult(aiAnalysisFactors: CodeMetrics): any {
        return {
            "filesCount": 0,
            "auditEffort": {
                "timeRange": {
                    "minimumDays": Math.floor(Math.random() * (10 - 5 + 1)) + 5,
                    "maximumDays": Math.floor(Math.random() * (20 - 10 + 1)) + 10
                },
                "resourceRange": (() => {
                    const min = Math.floor(Math.random() * (3 - 1 + 1)) + 1;
                    const max = Math.floor(Math.random() * (3 - min + 1)) + min;
                    return {
                        "minimumCount": min,
                        "maximumCount": max
                    };
                })(),
                "totalCost": Math.round((Math.random() * (6000 - 2000) + 2000) / 1000) * 1000
            },
            "hotspots": {
                "totalCount": aiAnalysisFactors?.highRiskHotspots?.length + aiAnalysisFactors?.mediumRiskHotspots?.length + aiAnalysisFactors?.findings?.length || 0,
                "highRiskCount": aiAnalysisFactors?.highRiskHotspots?.length || 0,
                "mediumRiskCount": aiAnalysisFactors?.mediumRiskHotspots?.length || 0,
                "lowPriorityCount": aiAnalysisFactors?.findings?.length || 0
            },
            "receiptId": ""
        }
    }
}