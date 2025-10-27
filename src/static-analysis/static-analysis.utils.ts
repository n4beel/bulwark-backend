import { Injectable } from "@nestjs/common";
import { ComplexityScores } from "./dto/static-analysis.dto";

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

    calculateResult(): any {
        return {
            "filesCount": 0,
            "auditEffort": {
                "timeRange": {
                    "minimumDays": 0,
                    "maximumDays": 0
                },
                "resourceRange": {
                    "minimumCount": 0,
                    "maximumCount": 0
                },
                "totalCost": 0
            },
            "hotspots": {
                "totalCount": 0,
                "highRiskCount": 0,
                "mediumRiskCount": 0,
                "lowPriorityCount": 0
            },
            "receiptId": ""
        }
    }
}