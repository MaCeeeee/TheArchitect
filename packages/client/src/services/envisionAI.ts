import api from './api';
import type {
  AIVisionSuggestion,
  AIStakeholderSuggestion,
  AIPrincipleSuggestion,
  AIConflictInsight,
  AIReadinessAssessment,
  AIDocumentExtraction,
} from '@thearchitect/shared';

export const envisionAIService = {
  generateVision: (projectId: string, description: string) =>
    api.post<{ data: AIVisionSuggestion }>(
      `/projects/${projectId}/envision/ai/generate-vision`,
      { description },
    ).then(r => r.data.data),

  suggestStakeholders: (projectId: string, scope: string, visionStatement: string) =>
    api.post<{ data: AIStakeholderSuggestion[] }>(
      `/projects/${projectId}/envision/ai/suggest-stakeholders`,
      { scope, visionStatement },
    ).then(r => r.data.data),

  suggestPrinciples: (projectId: string, scope: string, existingPrinciples: string[]) =>
    api.post<{ data: AIPrincipleSuggestion[] }>(
      `/projects/${projectId}/envision/ai/suggest-principles`,
      { scope, existingPrinciples },
    ).then(r => r.data.data),

  detectConflicts: (projectId: string, stakeholders: unknown[]) =>
    api.post<{ data: AIConflictInsight[] }>(
      `/projects/${projectId}/envision/ai/detect-conflicts`,
      { stakeholders },
    ).then(r => r.data.data),

  assessReadiness: (projectId: string, vision: unknown, stakeholders: unknown[]) =>
    api.post<{ data: AIReadinessAssessment }>(
      `/projects/${projectId}/envision/ai/assess-readiness`,
      { vision, stakeholders },
    ).then(r => r.data.data),

  suggestInterests: (projectId: string, stakeholderType: string, scope: string) =>
    api.post<{ data: string[] }>(
      `/projects/${projectId}/envision/ai/suggest-interests`,
      { stakeholderType, scope },
    ).then(r => r.data.data),

  extractDocument: (projectId: string, file: File) => {
    const form = new FormData();
    form.append('document', file);
    return api.post<{ data: AIDocumentExtraction }>(
      `/projects/${projectId}/envision/ai/extract-document`,
      form,
      { headers: { 'Content-Type': undefined }, timeout: 120_000 },
    ).then(r => r.data.data);
  },
};
