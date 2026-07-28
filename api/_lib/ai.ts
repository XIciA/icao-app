const TEXT_BASE_URL = process.env.DASHSCOPE_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const TEMPORARY_UPLOAD_POLICY_URL = 'https://dashscope.aliyuncs.com/api/v1/uploads';
const TEXT_MODEL = process.env.AI_TEXT_MODEL ?? 'qwen-turbo';
const ASR_MODEL = process.env.AI_ASR_MODEL ?? 'qwen3-asr-flash';

const GRAMMAR_REVIEW_PROMPT = `You are an English grammar checker.

Review the learner's English text.
Return only valid JSON matching the required schema.

Rules:
- Identify only clear grammar, spelling, or punctuation errors.
- Put each issue in a separate Chinese string: “original” → “correction”：brief reason.
- Provide one correctedText that preserves all original meaning and information.
- If there are no clear errors, return an empty issues array and keep correctedText unchanged.
- Do not improve style, replace wording for professionalism, add information, score, grade, or provide learning advice.`;

const OPI_POLISH_PROMPT = `You are an English speaking-expression editor.

Rewrite the learner's text into natural, clear spoken English.
Return exactly one valid JSON object with this shape:
{"polishedText":"the rewritten spoken English"}

Rules:
- Preserve the learner's original meaning, facts, sequence, and level of certainty.
- Use correctedText as the source when it is provided; otherwise use transcript.
- Improve clarity and naturalness without adding new information.
- Do not turn the response into a model answer.
- Do not provide explanations, scores, grades, advice, or extra fields.`;

const WORD_LOOKUP_PROMPT = `You are an ICAO aviation-English learning assistant.

Explain only the selected English word or phrase in the supplied sentence.
Return JSON with:
- definition: a concise Chinese definition appropriate for this context.
- contextExplanationZh: a concise Chinese explanation of the full sentence meaning.
Do not add scores, exercises, Markdown, or unrelated knowledge.`;

function apiKey() {
  const value = process.env.DASHSCOPE_API_KEY;
  if (!value) throw new Error('ai_not_configured');
  return value;
}

async function upstream(url: string, init: RequestInit, timeoutMilliseconds = 20_000) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMilliseconds) });
      if (response.ok) return response;
      console.error(JSON.stringify({
        event: 'ai_upstream_http_error',
        origin: new URL(url).origin,
        status: response.status,
        detail: (await response.text()).slice(0, 500),
      }));
      if (response.status === 429) throw new Error('ai_upstream_limited');
      if (response.status < 500 || attempt > 0) throw new Error('ai_upstream_failed');
    } catch (error) {
      const cause = error instanceof Error && error.cause && typeof error.cause === 'object'
        ? error.cause as { code?: unknown; message?: unknown }
        : undefined;
      console.error(JSON.stringify({
        event: 'ai_upstream_network_error',
        origin: new URL(url).origin,
        attempt: attempt + 1,
        name: error instanceof Error ? error.name : 'unknown',
        message: error instanceof Error ? error.message : 'unknown',
        causeCode: typeof cause?.code === 'string' ? cause.code : undefined,
        causeMessage: typeof cause?.message === 'string' ? cause.message : undefined,
      }));
      if (
        error instanceof Error
        && ['ai_upstream_failed', 'ai_upstream_limited'].includes(error.message)
      ) {
        throw error;
      }
      if (attempt > 0) throw new Error('ai_upstream_failed');
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('ai_upstream_failed');
}

export async function generateJson(system: string, input: unknown) {
  const response = await upstream(`${TEXT_BASE_URL.replace(/\/+$/u, '')}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey()}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: TEXT_MODEL,
      messages: [
        { role: 'system', content: `${system}\nReturn only one valid JSON object without Markdown.` },
        { role: 'user', content: JSON.stringify(input) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });
  const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('ai_invalid_response');
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error('ai_invalid_response');
  }
}

function string(value: unknown, maximum: number) {
  return typeof value === 'string' && value.trim() && value.length <= maximum ? value.trim() : undefined;
}

export async function wordLookup(body: unknown) {
  const input = body as Record<string, unknown>;
  const word = string(input.word, 80);
  const sentence = string(input.sentence, 1200);
  if (!word || !sentence) throw new Error('invalid_word_lookup');
  const generated = await generateJson(WORD_LOOKUP_PROMPT, { task: 'Explain the selected word or phrase in this exact learning context.', input });
  const result = generated as Record<string, unknown>;
  const definition = string(result.definition, 800);
  const sentenceMeaning = string(result.contextExplanationZh, 1200);
  if (!definition || !sentenceMeaning) throw new Error('ai_invalid_response');
  return { word, definition, sentenceMeaning, promptVersion: 'word-lookup-v1', cached: false };
}

export async function grammarReview(body: unknown) {
  const input = body as Record<string, unknown>;
  const transcript = string(input.transcript, 4000);
  if (!transcript) throw new Error('invalid_grammar_review');
  const generated = await generateJson(GRAMMAR_REVIEW_PROMPT, { transcript });
  const result = generated as Record<string, unknown>;
  const correctedText = string(result.correctedText, 5000);
  const issues = Array.isArray(result.issues)
    ? result.issues.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, 30)
    : undefined;
  if (!correctedText || !issues) throw new Error('ai_invalid_response');
  return { correctedText, issues, promptVersion: 'grammar-review:v2' };
}

export async function polish(body: unknown) {
  const input = body as Record<string, unknown>;
  const transcript = string(input.transcript, 4000);
  const correctedText = input.correctedText === undefined ? undefined : string(input.correctedText, 5000);
  if (!transcript || (input.correctedText !== undefined && !correctedText)) throw new Error('invalid_polish');
  const generated = await generateJson(OPI_POLISH_PROMPT, { transcript, ...(correctedText ? { correctedText } : {}) });
  const result = generated as Record<string, unknown>;
  const polishedText = string(result.polishedText, 5000);
  if (!polishedText) throw new Error('ai_invalid_response');
  return { polishedText, promptVersion: 'polish:v2' };
}

type TemporaryUploadPolicy = {
  data?: {
    policy?: unknown;
    signature?: unknown;
    upload_dir?: unknown;
    upload_host?: unknown;
    oss_access_key_id?: unknown;
    x_oss_object_acl?: unknown;
    x_oss_forbid_overwrite?: unknown;
  };
};

function audioData(fileUrl: string) {
  const matched = /^data:(audio\/(?:webm|mp4|m4a|x-m4a|wav|mpeg|ogg|opus));base64,([A-Za-z0-9+/]+=*)$/u.exec(fileUrl);
  if (!matched) throw new Error('invalid_audio');
  const mime = matched[1];
  const bytes = Buffer.from(matched[2], 'base64');
  if (!bytes.length || bytes.length > 3_000_000) throw new Error('invalid_audio');
  const extension = mime === 'audio/mpeg'
    ? 'mp3'
    : mime.replace(/^audio\//u, '').replace(/^x-/u, '');
  return { bytes, extension, mime };
}

async function uploadTemporaryAudio(fileUrl: string) {
  const audio = audioData(fileUrl);
  const policyResponse = await upstream(
    `${TEMPORARY_UPLOAD_POLICY_URL}?action=getPolicy&model=${encodeURIComponent(ASR_MODEL)}`,
    {
      headers: {
        authorization: `Bearer ${apiKey()}`,
        'content-type': 'application/json',
      },
    },
  );
  const policyPayload = await policyResponse.json() as TemporaryUploadPolicy;
  const data = policyPayload.data;
  const policy = typeof data?.policy === 'string' ? data.policy : '';
  const signature = typeof data?.signature === 'string' ? data.signature : '';
  const uploadDirectory = typeof data?.upload_dir === 'string' ? data.upload_dir : '';
  const uploadHost = typeof data?.upload_host === 'string' ? data.upload_host : '';
  const accessKeyId = typeof data?.oss_access_key_id === 'string' ? data.oss_access_key_id : '';
  const objectAcl = typeof data?.x_oss_object_acl === 'string' ? data.x_oss_object_acl : '';
  const forbidOverwrite = typeof data?.x_oss_forbid_overwrite === 'string'
    ? data.x_oss_forbid_overwrite
    : '';
  if (
    !policy
    || !signature
    || !uploadDirectory
    || !accessKeyId
    || !objectAcl
    || !forbidOverwrite
    || !uploadHost.startsWith('https://')
    || !new URL(uploadHost).hostname.endsWith('.aliyuncs.com')
  ) {
    throw new Error('ai_invalid_response');
  }

  const key = `${uploadDirectory}/web-recording-${crypto.randomUUID()}.${audio.extension}`;
  const form = new FormData();
  form.append('OSSAccessKeyId', accessKeyId);
  form.append('Signature', signature);
  form.append('policy', policy);
  form.append('x-oss-object-acl', objectAcl);
  form.append('x-oss-forbid-overwrite', forbidOverwrite);
  form.append('key', key);
  form.append('success_action_status', '200');
  form.append('file', new Blob([audio.bytes], { type: audio.mime }), `recording.${audio.extension}`);
  await upstream(uploadHost, { method: 'POST', body: form }, 30_000);
  return `oss://${key}`;
}

export async function transcribeUrl(fileUrl: string) {
  const temporaryAudioUrl = await uploadTemporaryAudio(fileUrl);
  const response = await upstream(`${TEXT_BASE_URL.replace(/\/+$/u, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey()}`,
      'content-type': 'application/json',
      'x-dashscope-ossresourceresolve': 'enable',
    },
    body: JSON.stringify({
      model: ASR_MODEL,
      messages: [{
        role: 'user',
        content: [{ type: 'input_audio', input_audio: { data: temporaryAudioUrl } }],
      }],
      stream: false,
      asr_options: { language: 'en', enable_itn: true },
    }),
  }, 60_000);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
  const transcript = typeof payload.choices?.[0]?.message?.content === 'string'
    ? payload.choices[0].message.content.replace(/\s+/gu, ' ').trim()
    : '';
  if (!transcript) throw new Error('no_speech_detected');
  return { transcript };
}
