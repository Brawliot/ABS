/**
 * Refinamiento iterativo: refina una métrica y selecciona la siguiente pregunta
 */

import { refinePhase2Metric, type RefineRequest } from "./planner-phase2-refine.js";
import type { Phase2Response } from "./planner-phase2-handler.js";

interface RefineIterateRequest {
  metric: string;
  question: string;
  userAnswer: string;
  originalAnalysis: string;
  originalInput: string;
  currentAnalysis: Phase2Response;
}

interface RefineIterateResponse {
  updatedAnalysis: Phase2Response;
  nextQuestion: string | null;
  allComplete: boolean;
}

function selectNextQuestion(analysis: Phase2Response): { question: string; metric: string } | null {
  const metrics = [
    { name: "subsector", conf: analysis.subsector.confidence, q: analysis.subsector.follow_up_question },
    { name: "localizacion", conf: analysis.localizacion.confidence, q: analysis.localizacion.follow_up_question },
    { name: "flexibilidad_timeline", conf: analysis.flexibilidad_timeline.confidence, q: analysis.flexibilidad_timeline.follow_up_question },
    { name: "constraints", conf: analysis.constraints.confidence, q: analysis.constraints.follow_up_question },
    { name: "claridad_concepto", conf: analysis.claridad_concepto.confidence, q: analysis.claridad_concepto.follow_up_question }
  ];

  const sortedByConfidence = metrics.sort((a, b) => a.conf - b.conf);

  if (sortedByConfidence[0].conf < 80 && sortedByConfidence[0].q) {
    return {
      question: sortedByConfidence[0].q,
      metric: sortedByConfidence[0].name
    };
  }

  return null;
}

export async function refineAndSelectNextQuestion(req: RefineIterateRequest): Promise<RefineIterateResponse> {
  const refineReq: RefineRequest = {
    metric: req.metric,
    question: req.question,
    userAnswer: req.userAnswer,
    originalAnalysis: req.originalAnalysis,
    originalInput: req.originalInput
  };

  const refinedMetric = await refinePhase2Metric(refineReq);

  const updatedAnalysis: Phase2Response = {
    ...req.currentAnalysis,
    [req.metric]: refinedMetric
  };

  const next = selectNextQuestion(updatedAnalysis);

  return {
    updatedAnalysis,
    nextQuestion: next?.question || null,
    allComplete: !next
  };
}

export type { RefineIterateRequest, RefineIterateResponse };
