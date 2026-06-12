import { embed } from "npm:ai@6.0.184"
import { createOpenAI } from "npm:@ai-sdk/openai@3.0.64"

/** work_cases.embedding 과 동일하게 OpenAI text-embedding-3-small (1536차원) */
export async function embedWorkCaseText(
  openaiKey: string,
  text: string,
): Promise<number[]> {
  const openai = createOpenAI({ apiKey: openaiKey })
  const { embedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: text.trim().slice(0, 12000),
  })
  return embedding
}
