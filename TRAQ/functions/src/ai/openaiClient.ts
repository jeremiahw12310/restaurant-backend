interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatChoice {
  message: { content: string }
}

interface ChatResponse {
  choices: ChatChoice[]
}

const MODEL = 'gpt-4o-mini'
const MAX_TOKENS = 220
const TEMPERATURE = 0.85

export type ChatCompletionOptions = {
  maxTokens?: number
  temperature?: number
}

export async function chatCompletion(
  apiKey: string,
  system: string,
  user: string,
  opts?: ChatCompletionOptions,
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: opts?.maxTokens ?? MAX_TOKENS,
      temperature: opts?.temperature ?? TEMPERATURE,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`)
  }

  const json = (await res.json()) as ChatResponse
  const text = json.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('Empty response from OpenAI')
  return text
}
