import { Injectable } from "@nestjs/common";
import { ComplexityScores } from "./dto/static-analysis.dto";
import { AiAnalysisResults, CodeMetrics } from "src/ai-analysis/ai-analysis.service";
import { AuditStorageData } from "src/arcium-storage/arcium-storage.service";

@Injectable()
export class StaticAnalysisUtils {
    constructor() { }

    calculateTotalScore(staticAnalysisScores: any, aiAnalysisFactors: CodeMetrics): { scores: any, result: any } {
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

        const scores = {
            structural: structuralScore,
            security: securityScore,
            systemic: systemicScore,
            economic: economicScore,
            total: totalScore,
        }

        const result = this.calculateResult(aiAnalysisFactors, totalScore);

        return { scores, result };
    }

    calculateResult(aiAnalysisFactors: CodeMetrics, totalScore: number): any {


        return {
            "filesCount": 0,
            ...this.estimatedAuditEffort(totalScore),
            "hotspots": {
                "totalCount": aiAnalysisFactors?.highRiskHotspots?.length + aiAnalysisFactors?.mediumRiskHotspots?.length + aiAnalysisFactors?.findings?.length || 0,
                "highRiskCount": aiAnalysisFactors?.highRiskHotspots?.length || 0,
                "mediumRiskCount": aiAnalysisFactors?.mediumRiskHotspots?.length || 0,
                "lowPriorityCount": aiAnalysisFactors?.findings?.length || 0
            },
            "receiptId": "",
            "commitUrl": "",
            "hrefUrl": "",
        }
    }

    estimatedAuditEffort(totalScore: number): any {
        // Constants
        const DAYS_PER_WEEK = 5;
        const PHI = 0.8;
        const AUDITORS_3 = 3;
        const SLOPE_ABOVE_MAX = 1.468429;
        const SLOPE_BELOW_MIN = 0.627746;
        const MIN_MEDIAN_DAYS = 1;
        const COST_BUDGET_LOW = 2500;
        const COST_BUDGET_HIGH = 6000;

        const data = [
            {
                medianAuditTimeline: 8,
                skewedAuditTimeline: 12.2,
                medianComplexity: 16.98
            },
            {
                medianAuditTimeline: 15,
                skewedAuditTimeline: 24.6,
                medianComplexity: 23.895
            },
            {
                medianAuditTimeline: 17,
                skewedAuditTimeline: 28,
                medianComplexity: 35.01
            },
            {
                medianAuditTimeline: 20,
                skewedAuditTimeline: 28,
                medianComplexity: 43.81
            },
            {
                medianAuditTimeline: 30,
                skewedAuditTimeline: 36,
                medianComplexity: 50.62
            }
        ];

        // Find lower and upper bounds based on totalScore compared to medianComplexity
        const sortedData = [...data].sort((a, b) => a.medianComplexity - b.medianComplexity);

        let lower: { medianAuditTimeline: number; skewedAuditTimeline: number; medianComplexity: number; } | null = null;
        let upper: { medianAuditTimeline: number; skewedAuditTimeline: number; medianComplexity: number; } | null = null;

        const maxComplexity = sortedData[sortedData.length - 1].medianComplexity;
        const minComplexity = sortedData[0].medianComplexity;

        if (totalScore >= maxComplexity) {
            lower = sortedData[sortedData.length - 1];
        } else if (totalScore <= minComplexity) {
            upper = sortedData[0];
        } else {
            // Single pass: find both bounds simultaneously
            for (let i = 0; i < sortedData.length - 1; i++) {
                if (sortedData[i].medianComplexity < totalScore && sortedData[i + 1].medianComplexity > totalScore) {
                    lower = sortedData[i];
                    upper = sortedData[i + 1];
                    break;
                }
            }
        }

        // Timeline calculation for 2 auditors
        let medianDays, skewedDays;

        if (upper && lower) {
            const slope = (totalScore - lower.medianComplexity) / (upper.medianComplexity - lower.medianComplexity);
            medianDays = Math.round(lower.medianAuditTimeline + slope * (upper.medianAuditTimeline - lower.medianAuditTimeline));
            skewedDays = Math.round(lower.skewedAuditTimeline + slope * (upper.skewedAuditTimeline - lower.skewedAuditTimeline));
        } else if (!upper && lower) {
            medianDays = Math.round(lower.medianAuditTimeline + SLOPE_ABOVE_MAX * (totalScore - lower.medianComplexity));
            skewedDays = Math.round(medianDays + (lower.skewedAuditTimeline - lower.medianAuditTimeline));
        } else if (!lower && upper) {
            medianDays = Math.round(Math.max(MIN_MEDIAN_DAYS, upper.medianAuditTimeline - SLOPE_BELOW_MIN * (upper.medianComplexity - totalScore)));
            skewedDays = Math.round(medianDays + (upper.skewedAuditTimeline - upper.medianAuditTimeline));
        }

        // Timeline calculation for 3 auditors
        const auditorMultiplier = (1 - PHI) + PHI * (2 / AUDITORS_3);
        const medianDays3 = Math.round(medianDays * auditorMultiplier);
        const skewedDays3 = Math.round(skewedDays * auditorMultiplier);

        // Calculate only the costs that are actually used
        const calculateCost = (days, isLowBudget) => {
            return Math.round((days / DAYS_PER_WEEK) * (isLowBudget ? COST_BUDGET_LOW : COST_BUDGET_HIGH));
        };

        const cost2Low = calculateCost(medianDays, true);
        const cost2High = calculateCost(skewedDays, false);
        const cost3Low = calculateCost(medianDays3, true);
        const cost3High = calculateCost(skewedDays3, false);

        console.log('===============================================');
        console.log(`timeline for 2 auditors: ${medianDays} days - ${skewedDays} days`);
        console.log(`cost for 2 auditors budget: ${cost2Low * 2} - ${cost2High * 2}`);
        console.log('===============================================');
        console.log(`timeline for 3 auditors: ${medianDays3} days - ${skewedDays3} days`);
        console.log(`cost for 3 auditors budget: ${cost3Low * 3} - ${cost3High * 3}`);

        const estimates = {
            "lowerAuditEffort": {
                "timeRange": {
                    "minimumDays": medianDays,
                    "maximumDays": skewedDays
                },
                "resources": 2,
                "costRange": {
                    "minimumCost": cost2Low * 2,
                    "maximumCost": cost2High * 2
                }
            },
            "upperAuditEffort": {
                "timeRange": {
                    "minimumDays": medianDays3,
                    "maximumDays": skewedDays3
                },
                "resources": 3,
                "costRange": {
                    "minimumCost": cost3Low * 3,
                    "maximumCost": cost3High * 3
                }
            },
        }

        return estimates;
    }

    transformForSafeStorage(aiAnalysisFactors: CodeMetrics): AuditStorageData {
        return {
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
                "mediumRiskCount": aiAnalysisFactors?.mediumRiskHotspots?.length || 0
            },
            "commitHash": Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
        }
    }
}