import { z } from 'zod';

export const PROTOCOL_VERSION = 4 as const;

export const adapterSourceSchema = z.enum(['CHROME', 'VSCODE']);
export type AdapterSource = z.infer<typeof adapterSourceSchema>;
export const platformIdSchema = z.enum([
  'X',
  'GOOGLE',
  'YOUTUBE',
  'WHATSAPP',
  'CHATGPT',
  'CLAUDE',
  'VSCODE',
  'CURSOR',
]);
export type PlatformId = z.infer<typeof platformIdSchema>;
export const contextKindSchema = z.enum([
  'DRAFT_TEXT',
  'SOCIAL_POST',
  'SEARCH_QUERY',
  'CONVERSATION',
  'ARTICLE_TEXT',
  'SELECTED_TEXT',
  'SELECTED_CODE',
]);
export type ContextKind = z.infer<typeof contextKindSchema>;

export const contextObservationSchema = z.object({
  kind: contextKindSchema,
  platformId: platformIdSchema,
  text: z.string().trim().min(1).max(8_000),
  applicationId: z.string().trim().min(1).max(80),
  domain: z.string().trim().max(253).optional(),
  title: z.string().trim().max(300).optional(),
  languageId: z.string().trim().max(80).optional(),
  documentUri: z.string().trim().max(2_048).optional(),
  observedAt: z.number().int().nonnegative(),
});
export type ContextObservation = z.infer<typeof contextObservationSchema>;

export const protocolEnvelopeSchema = z.discriminatedUnion('type', [
  z.object({
    version: z.literal(PROTOCOL_VERSION),
    id: z.string().uuid(),
    source: adapterSourceSchema,
    type: z.literal('CONTEXT'),
    timestamp: z.number().int().positive(),
    payload: contextObservationSchema,
  }),
  z.object({
    version: z.literal(PROTOCOL_VERSION),
    id: z.string().uuid(),
    source: adapterSourceSchema,
    type: z.literal('UI_COMMAND'),
    timestamp: z.number().int().positive(),
    payload: z.object({ command: z.enum(['SHOW', 'UP', 'DOWN', 'LEFT', 'RIGHT']) }),
  }),
  z.object({
    version: z.literal(PROTOCOL_VERSION),
    id: z.string().uuid(),
    source: adapterSourceSchema,
    type: z.literal('HEARTBEAT'),
    timestamp: z.number().int().positive(),
    payload: z.object({}),
  }),
]);
export type ProtocolEnvelope = z.infer<typeof protocolEnvelopeSchema>;

export function parseProtocolEnvelope(input: unknown): ProtocolEnvelope {
  return protocolEnvelopeSchema.parse(input);
}
