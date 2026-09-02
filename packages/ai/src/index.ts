import { z } from 'zod';

export const aiTaskSchema = z.enum([
  'EXPLAIN_CODE',
  'EXPLAIN_TEXT',
  'IMPROVE_WRITING',
  'DRAFT_X_REPLY',
]);
export type AITask = z.infer<typeof aiTaskSchema>;

export const aiRequestSchema = z.object({
  id: z.string().uuid(),
  task: aiTaskSchema,
  text: z.string().trim().min(1).max(12_000),
  tone: z.enum(['NATURAL', 'PROFESSIONAL', 'CONCISE', 'FRIENDLY']).default('NATURAL'),
  maxOutputCharacters: z.number().int().min(80).max(4_000).default(1_200),
});
export type AIRequest = z.infer<typeof aiRequestSchema>;

export const aiResponseSchema = z.object({
  requestId: z.string().uuid(),
  provider: z.string().min(1),
  model: z.string().min(1),
  outputs: z.array(z.string().trim().min(1).max(4_000)).min(1).max(3),
  createdAt: z.number().int().nonnegative(),
});
export type AIResponse = z.infer<typeof aiResponseSchema>;

export interface AIProvider {
  generate(request: AIRequest, signal?: AbortSignal): Promise<AIResponse>;
  healthCheck(signal?: AbortSignal): Promise<boolean>;
}

export const visionTaskSchema = z.enum(['DESCRIBE_REGION', 'READ_ERROR', 'UNDERSTAND_DIALOG']);
export type VisionTask = z.infer<typeof visionTaskSchema>;

export interface VisionRequest {
  id: string;
  task: VisionTask;
  imageBase64: string;
  mimeType: 'image/png' | 'image/jpeg';
}

export interface VisualObservation {
  requestId: string;
  summary: string;
  visibleText: readonly string[];
  confidence: number;
  uncertain: boolean;
  observedAt: number;
  expiresAt: number;
}

export interface VisionProvider {
  analyze(request: VisionRequest, signal?: AbortSignal): Promise<VisualObservation>;
  healthCheck(signal?: AbortSignal): Promise<boolean>;
}

export class ModelRouter {
  public constructor(
    private readonly textProvider: AIProvider,
    private readonly visionProvider?: VisionProvider,
  ) {}

  public generate(request: AIRequest, signal?: AbortSignal): Promise<AIResponse> {
    return this.textProvider.generate(aiRequestSchema.parse(request), signal);
  }

  public analyze(request: VisionRequest, signal?: AbortSignal): Promise<VisualObservation> {
    if (!this.visionProvider) throw new Error('VISION_PROVIDER_UNAVAILABLE');
    return this.visionProvider.analyze(request, signal);
  }
}
