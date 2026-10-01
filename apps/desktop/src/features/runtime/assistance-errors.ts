export function assistanceErrorText(error: unknown): string {
  if (typeof error !== 'string') return "I couldn't finish that thought. Try the same arrow again.";
  const friendly: Record<string, string> = {
    GROQ_RESPONSE_EMPTY: 'The writing service returned no text. Try the same arrow again.',
    GROQ_REQUEST_FAILED: "I couldn't reach Groq. Check your connection, then try the same arrow.",
    GROQ_REQUEST_TIMEOUT: 'Groq took too long to respond. Try the same arrow again.',
    GROQ_STREAM_INVALID: 'The response was interrupted. Try the same arrow once more.',
    GROQ_STREAM_CHUNK_INVALID: 'The response was interrupted. Try the same arrow once more.',
    GROQ_AUTH_FAILED: 'Groq rejected the API key. Check the key configured for POP.',
    GROQ_ACCESS_DENIED: 'This Groq key does not have access to the selected model.',
    GROQ_MODEL_UNAVAILABLE: "The configured Groq model is unavailable. Check POP's model setting.",
    GROQ_CONTEXT_TOO_LARGE: 'This selection exceeds the model limit. Select a smaller section.',
    GROQ_QUOTA_EXHAUSTED:
      'The Groq account allowance is exhausted. Check its usage or billing limits.',
    GROQ_UNAVAILABLE: 'Groq is temporarily busy. POP retried; try the same arrow again shortly.',
    GROQ_GENERATION_FAILED:
      'Groq could not finish this response after retrying. Try the same arrow again.',
    GROQ_INVALID_REQUEST:
      'Groq rejected the request format. POP saved the error code for diagnosis.',
    REQUEST_CANCELLED: '',
    STALE_CONTEXT: 'That selection expired. Select it again and I will pick it up.',
    TASK_CONTEXT_MISMATCH: 'That selection changed. Select the text again, then use the arrow.',
  };
  if (friendly[error] !== undefined) return friendly[error];
  const rateLimit = /^GROQ_RATE_LIMITED:(\d+)$/.exec(error);
  if (rateLimit) {
    const seconds = Math.max(1, Number(rateLimit[1]));
    const wait = seconds < 60 ? `${seconds} seconds` : `about ${Math.ceil(seconds / 60)} minutes`;
    return `Groq's usage limit is reached. Wait ${wait}, then try the same arrow again.`;
  }
  const status = /^GROQ_(?:REQUEST_REJECTED:|REQUEST_)(\d{3})$/.exec(error)?.[1];
  if (status) {
    return `Groq returned error ${status}. POP could not generate this response.`;
  }
  return "I couldn't finish that thought. Try the same arrow again.";
}
