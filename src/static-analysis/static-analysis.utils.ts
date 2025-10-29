import { Injectable } from "@nestjs/common";
import { ComplexityScores } from "./dto/static-analysis.dto";
import { AiAnalysisResults, CodeMetrics } from "src/ai-analysis/ai-analysis.service";

@Injectable()
export class StaticAnalysisUtils {
    constructor() { }

    calculateTotalScore(staticAnalysisScores: any): any {
        const structuralScore = (
            staticAnalysisScores.structural["total_statement_count"] * 0.25 +
            staticAnalysisScores.structural["number_of_functions/instructions_handlers"] * 0.25 +
            staticAnalysisScores.structural["cyclomatic_complexity_&_control_flow"] * 0.20 +
            staticAnalysisScores.structural["modularity_and_files_per_modules_count"] * 0.15 +
            staticAnalysisScores.structural["external_dependencies"] * 0.15
        );

        const securityScore = (
            staticAnalysisScores.security["access_controlled_handlers"] * 0.20 +
            staticAnalysisScores.security["PDA_seeds_surface_&_ownership"] * 0.15 +
            staticAnalysisScores.security["cross_program_invocation_(CPI)"] * 0.15 +
            staticAnalysisScores.security["input/constraints_surface"] * 0.15 +
            staticAnalysisScores.security["arithmetic_operations"] * 0.10 +
            staticAnalysisScores.security["priviliged_roles_& _admin_actions"] * 0.10 +
            staticAnalysisScores.security["unsafe/low_level_usage"] * 0.10 +
            staticAnalysisScores.security["error_handling_footprint"] * 0.05
        );
        const systemicScore = (
            staticAnalysisScores.systemic["upgradability_and_governance_control"] * 0.20 +
            staticAnalysisScores.systemic["external_integration_&_oracles"] * 0.30 +
            staticAnalysisScores.systemic["composability_and_inter_program_complexity"] * 0.20 +
            staticAnalysisScores.systemic["denial_of_service_&_resource_limits"] * 0.15 +
            staticAnalysisScores.systemic["operational_security_factors"] * 0.15
        );
        const economicScore = (
            staticAnalysisScores.economic["number_of_asset_&_asset_types"] * 0.50 +
            staticAnalysisScores.economic["invariants_&_risk_parameters"] * 0.50
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