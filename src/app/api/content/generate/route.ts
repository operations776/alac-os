/**
 * Draft a piece of content in Adrian's voice.
 *
 * OpenAI through the shared client in src/lib/server/ai. With no usable key the
 * endpoint says drafting is off rather than inventing text, and the rest of the
 * Content Studio keeps working by hand. AI.md: the agent_runs row is claimed
 * before the paid call and closed with its tokens and cost after.
 */
import { NextResponse } from "next/server";
import { asPerson, opsQuery } from "@/lib/server/db";
import { requirePerson, type OpsSession } from "@/lib/server/ops/context";
import { openai, reasoningStatus } from "@/lib/server/ai/openai";
import { costUsd } from "@/lib/server/ai/pricing";
import { buildPrompt, isScriptKind, type GenerateRequest } from "@/lib/ops/content-prompt";
import { CONTENT_KINDS, PLATFORMS } from "@/lib/ops/constants";
import type { VoiceProfile } from "@/types/ops";

export const maxDuration = 60;

export async function POST(request: Request) {
  let ctx: OpsSession;
  try {
    ctx = await requirePerson("viewer");
  } catch {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const status = reasoningStatus();
  if (!status.available) {
    return NextResponse.json({
      error: "not_configured",
      message:
        "Drafting is off because the OpenAI key is not configured. " +
        "Everything else in the Content Studio works without it.",
    }, { status: 503 });
  }

  let body: GenerateRequest & { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "A topic is required" }, { status: 400 });
  }
  // The prompt indexes both lookups, so an unknown value is a bad request, not a crash.
  if (!PLATFORMS.includes(body.platform) || !CONTENT_KINDS.includes(body.kind)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const [voice] = await opsQuery<VoiceProfile>("select * from mc.voice_profile where id = 1");
  const { system, user: prompt } = buildPrompt(body, voice ?? null);
  const model = status.model;

  // Claim before the money is spent. The enum has no content kind yet, so the
  // feature rides in params.
  const [run] = await opsQuery<{ id: string }>(
    `insert into agent_runs (org_id, kind, status, trigger, triggered_by, params, model, items_total, started_at)
     values ($1, 'draft_message', 'running', 'api', $2, $3::jsonb, $4, 1, now())
     returning id`,
    [
      ctx.session.orgId,
      ctx.session.userId,
      JSON.stringify({ feature: "content_generate", content_id: body.id ?? null }),
      model,
    ],
  );
  const failRun = (error: string, inTok = 0, outTok = 0) =>
    opsQuery(
      `update agent_runs set status = 'failed', items_failed = 1, input_tokens = $3,
              output_tokens = $4, cost_usd = $5, error = $2, finished_at = now(),
              duration_ms = (extract(epoch from now() - started_at) * 1000)::int
        where id = $1`,
      [run.id, error.slice(0, 2000), inTok, outTok, costUsd(model, inTok, outTok) ?? 0],
    ).catch(() => {});

  let inTok = 0;
  let outTok = 0;
  try {
    const res = await openai().chat.completions.create({
      model,
      max_completion_tokens: 2000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    });

    inTok = res.usage?.prompt_tokens ?? 0;
    outTok = res.usage?.completion_tokens ?? 0;
    const text = (res.choices[0]?.message?.content ?? "").trim();

    if (!text) {
      await failRun("empty response", inTok, outTok);
      return NextResponse.json(
        { error: "empty", message: "The model returned nothing." },
        { status: 502 },
      );
    }

    // A script belongs in the script column; a post belongs in body.
    const field = isScriptKind(body.kind) ? "script" : "body";

    // The draft and the run's close land together, so a stored draft always
    // has its cost recorded.
    await asPerson(ctx.me.id, async (q) => {
      if (body.id) {
        await q(
          `update mc.content set ${field} = $2, status = 'in_progress', generated_at = now(), generated_by = $3
            where id = $1`,
          [body.id, text, model],
        );
      }
      await q(
        `update agent_runs set status = 'complete', items_ok = 1, input_tokens = $2, output_tokens = $3,
                cost_usd = $4, finished_at = now(),
                duration_ms = (extract(epoch from now() - started_at) * 1000)::int
          where id = $1`,
        [run.id, inTok, outTok, costUsd(model, inTok, outTok) ?? 0],
      );
    });

    return NextResponse.json({ text, field });
  } catch (e) {
    const message = (e as Error).message;
    await failRun(message, inTok, outTok);
    return NextResponse.json(
      { error: "generation_failed", message: message.slice(0, 400) },
      { status: 502 },
    );
  }
}
