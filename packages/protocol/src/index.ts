import { z } from 'zod';

export const PROTOCOL_VERSION = 2 as const;

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
  text: z.string().trim().min(1).max(12_000),
  applicationId: z.string().trim().min(1).max(80),
  domain: z.string().trim().max(253).optional(),
  title: z.string().trim().max(300).optional(),
  languageId: z.string().trim().max(80).optional(),
  documentUri: z.string().trim().max(2_048).optional(),
  observedAt: z.number().int().nonnegative(),
});
export type ContextObservation = z.infer<typeof contextObservationSchema>;

export const registerPayloadSchema = z
  .object({
    pairingCode: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    sessionToken: z.string().min(32).max(256).optional(),
  })
  .refine((value) => Boolean(value.pairingCode) !== Boolean(value.sessionToken), {
    message: 'Provide exactly one pairing credential.',
  });

export const protocolEnvelopeSchema = z.discriminatedUnion('type', [
  z.object({
    version: z.literal(PROTOCOL_VERSION),
    id: z.string().uuid(),
    source: adapterSourceSchema,
    type: z.literal('REGISTER'),
    timestamp: z.number().int().nonnegative(),
    payload: registerPayloadSchema,
  }),
  z.object({
    version: z.literal(PROTOCOL_VERSION),
    id: z.string().uuid(),
    source: adapterSourceSchema,
    type: z.literal('CONTEXT'),
    timestamp: z.number().int().nonnegative(),
    payload: contextObservationSchema,
  }),
  z.object({
    version: z.literal(PROTOCOL_VERSION),
    id: z.string().uuid(),
    source: z.literal('CHROME'),
    type: z.literal('PLATFORM_PERMISSION'),
    timestamp: z.number().int().nonnegative(),
    payload: z.object({
      platformId: platformIdSchema.exclude(['VSCODE', 'CURSOR']),
      enabled: z.boolean(),
    }),
  }),
  z.object({
    version: z.literal(PROTOCOL_VERSION),
    id: z.string().uuid(),
    source: adapterSourceSchema,
    type: z.literal('UI_COMMAND'),
    timestamp: z.number().int().nonnegative(),
    payload: z.object({ command: z.literal('SHOW') }),
  }),
  z.object({
    version: z.literal(PROTOCOL_VERSION),
    id: z.string().uuid(),
    source: adapterSourceSchema,
    type: z.literal('HEARTBEAT'),
    timestamp: z.number().int().nonnegative(),
    payload: z.object({}),
  }),
]);
export type ProtocolEnvelope = z.infer<typeof protocolEnvelopeSchema>;

export function parseProtocolEnvelope(input: unknown): ProtocolEnvelope {
  return protocolEnvelopeSchema.parse(input);
}
