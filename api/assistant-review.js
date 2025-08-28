// api/assistant-review.js
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Robustly extract JSON from an assistant message */
function readAssistantJson(message) {
  if (!message) return null;

  // Try different shapes emitted by the SDK
  const c0 = message.content?.[0];
  let text = "";

  if (c0?.type === "output_text" && c0.output_text?.value) {
    text = c0.output_text.value;
  } else if (c0?.type === "text" && c0.text?.value) {
    text = c0.text.value;
  } else if (typeof c0 === "string") {
    text = c0;
  } else if (typeof message?.content?.[0]?.text?.value === "string") {
    text = message.content[0].text.value;
  }

  // Try full parse; fallback to JSON substring
  try {
    return JSON.parse(text);
  } catch {}
  const s = text.indexOf("{"),
    e = text.lastIndexOf("}");
  if (s >= 0 && e > s) {
    try {
      return JSON.parse(text.slice(s, e + 1));
    } catch {}
  }
  return null;
}

/**
 * Run the configured Assistant on the provided flows and return { reviews: [...] }.
 * Uses the safest, most compatible flow: create thread -> create run -> poll -> read messages.
 *
 * @param {string} assistantId
 * @param {{customer:string, company_context?:string,
 *          flows:Array<{id:number,event:string,name:string,description?:string,link?:string}>}} payload
 * @param {{debug?:boolean, timeoutMs?:number}} opts
 */
export async function runAssistantReview(
  assistantId,
  payload,
  { debug = false, timeoutMs = 120000 } = {}
) {
  if (!assistantId) throw new Error("Assistant ID not configured");
  if (!payload || !Array.isArray(payload.flows)) return { reviews: [] };

  // 1) Create thread
  const thread = await client.beta.threads.create({
    messages: [{ role: "user", content: JSON.stringify(payload) }],
  });

  console.log("------------1", thread);

  const threadId = thread?.id;
  if (!threadId || !String(threadId).startsWith("thread_")) {
    throw new Error(`Invalid thread id from API: ${threadId ?? "(missing)"}`);
  }
  if (debug) console.log("[AI-Review] threadId:", threadId);

  // 2) Create run on that thread
  const run = await client.beta.threads.runs.create(threadId, {
    assistant_id: assistantId,
    // If you didn't put Structured Outputs on the Assistant in the dashboard,
    // you can pass response_format here.
  });

  console.log("-------------------2", run);

  const runId = run?.id;
  if (!runId || !String(runId).startsWith("run_")) {
    // If this ever prints a thread_… here, you know the SDK call result is being mis-read.
    throw new Error(`Invalid run id from API: ${runId ?? "(missing)"}`);
  }
  if (debug) console.log("[AI-Review] runId:", runId);

  // 3) Poll run
  const t0 = Date.now();
  while (true) {
    if (!threadId || !runId) {
      throw new Error(`Invalid threadId (${threadId}) or runId (${runId})`);
    }
    const r = await client.beta.threads.runs.retrieve(runId, {
      thread_id: threadId,
    });
    if (debug) console.log("[AI-Review] status:", r.status);

    if (r.status === "completed") break;
    if (["failed", "cancelled", "expired"].includes(r.status)) {
      const msg = r.last_error?.message || r.last_error || r.status;
      throw new Error(`Assistant run ${r.status}: ${msg}`);
    }
    if (Date.now() - t0 > timeoutMs) throw new Error("Assistant run timeout");
    await new Promise((res) => setTimeout(res, 1000));
  }

  // 4) Read messages for THIS run (prefer messages tagged with this run_id)
  const msgs = await client.beta.threads.messages.list(threadId, {
    order: "desc",
    limit: 50,
  });
  const found =
    msgs.data.find((m) => m.role === "assistant" && m.run_id === runId) ||
    msgs.data.find((m) => m.role === "assistant");

  const out = readAssistantJson(found);
  return out && Array.isArray(out.reviews) ? out : { reviews: [] };
}
