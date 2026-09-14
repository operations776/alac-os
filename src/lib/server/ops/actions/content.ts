"use server";

import { revalidatePath } from "next/cache";
import { asPerson, opsQuery } from "@/lib/server/db";
import { currentPerson, requirePerson } from "@/lib/server/ops/context";
import { type Result, wrote, fail, flushSlack, setClause } from "@/lib/server/ops/result";
import type { ContentKind, ContentStatus, Platform } from "@/types/ops";

// --- Content -------------------------------------------------------------------

export interface ContentInput {
  title: string;
  kind?: ContentKind;
  /** The primary platform. Additional ones live in content_platforms. */
  platform?: Platform;
  status?: ContentStatus;
  hook?: string | null;
  body?: string | null;
  script?: string | null;
  notes?: string | null;
  caption?: string | null;
  cta?: string | null;
  pillar?: string | null;
  owner_id?: string | null;
  publish_date?: string | null;
  published_url?: string | null;
  publish_method?: string;
  source?: string;
}

/** The columns a content patch may name: exactly the fields of ContentInput. */
const CONTENT_COLUMNS = [
  "title", "kind", "platform", "status", "hook", "body", "script", "notes", "caption",
  "cta", "pillar", "owner_id", "publish_date", "published_url", "publish_method", "source",
] as const;

export async function createContent(input: ContentInput): Promise<Result<{ id: string }>> {
  try {
    const { me } = await requirePerson("viewer");
    const [row] = await asPerson(me.id, (q) =>
      q<{ id: string }>(
        `insert into mc.content
           (title, kind, platform, status, hook, body, script, owner_id, publish_date, source, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         returning id`,
        [
          input.title.trim(),
          input.kind ?? "post",
          input.platform ?? "linkedin",
          input.status ?? "idea",
          input.hook ?? null,
          input.body ?? null,
          input.script ?? null,
          input.owner_id ?? me.id,
          input.publish_date ?? null,
          input.source ?? "manual",
          me.id,
        ],
      ),
    );

    revalidatePath("/content");
    return { ok: true, data: { id: row.id } };
  } catch (e) { return fail(e); }
}

export async function updateContent(id: string, patch: Partial<ContentInput>): Promise<Result> {
  try {
    const { me } = await requirePerson("viewer");
    const set = setClause(patch, CONTENT_COLUMNS, 2);
    if (set.empty) return { ok: true };
    // Verify the write landed: an UPDATE matching no row is not an error,
    // so without this a deleted row reports success.
    const hit = await asPerson(me.id, (q) =>
      q(`update mc.content set ${set.sql} where id = $1 returning id`, [id, ...set.values]),
    );
    { const w = wrote(hit, "content item"); if (!w.ok) return w; }
    revalidatePath("/content");
    await flushSlack();
    return { ok: true };
  } catch (e) { return fail(e); }
}

/**
 * Record how a published post performed.
 *
 * The whole form goes in one call so a save is atomic: fifteen separate
 * writes would leave the numbers half-updated if one failed. A blank field
 * arrives as null and is skipped rather than stored, so clearing a box you
 * did not mean to touch cannot wipe a reading somebody took yesterday.
 *
 * Every save appends rather than overwrites, which is what makes growth
 * answerable later: Monday's 2,000 impressions are still there on Friday.
 */
export async function recordContentMetrics(
  contentId: string,
  platform: Platform,
  metrics: Record<string, number | null>,
): Promise<Result> {
  try {
    const { me } = await requirePerson("member");

    // Guard here as well as in the database: a negative impression count is a
    // typo, and the clearer place to say so is next to the field.
    for (const [k, v] of Object.entries(metrics)) {
      if (v == null) continue;
      if (!Number.isFinite(v) || v < 0) {
        return { ok: false, error: `${k.replace(/_/g, " ")} must be zero or more.` };
      }
    }

    await asPerson(me.id, (q) =>
      q(
        `select mc.record_content_metrics(p_content => $1, p_platform => $2::mc.platform, p_metrics => $3::jsonb)`,
        [contentId, platform, JSON.stringify(metrics)],
      ),
    );

    revalidatePath("/content/analytics");
    revalidatePath("/content");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** The post's own URL, so analytics can be checked against the real thing. */
export async function setPublishedUrl(
  contentId: string, platform: Platform, url: string | null,
): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    const rows = await asPerson(me.id, (q) =>
      q(
        `update mc.content_platforms set published_url = $3
          where content_id = $1 and platform = $2::mc.platform
          returning content_id`,
        [contentId, platform, url?.trim() || null],
      ),
    );
    const w = wrote(rows, "post link");
    if (!w.ok) return w;
    revalidatePath("/content/analytics");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Move several content items to one status in a single action. */
export async function moveContent(ids: string[], status: ContentStatus): Promise<Result> {
  try {
    if (!ids.length) return { ok: true };
    const { me } = await requirePerson("viewer");
    await asPerson(me.id, (q) =>
      q(`update mc.content set status = $1::mc.content_status where id = any($2::uuid[])`, [status, ids]),
    );
    revalidatePath("/content");
    await flushSlack();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function deleteContent(id: string): Promise<Result> {
  try {
    const { me } = await requirePerson("viewer");
    await asPerson(me.id, (q) => q(`delete from mc.content where id = $1`, [id]));
    revalidatePath("/content");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function updateVoice(patch: {
  tone?: string | null;
  beliefs?: string | null;
  avoid?: string | null;
  samples?: string | null;
  audience?: string | null;
}): Promise<Result> {
  try {
    const { me } = await requirePerson("viewer");
    const set = setClause(patch, ["tone", "beliefs", "avoid", "samples", "audience"]);
    if (!set.empty) {
      await asPerson(me.id, (q) => q(`update mc.voice_profile set ${set.sql} where id = 1`, set.values));
    }
    revalidatePath("/content/voice");
    return { ok: true };
  } catch (e) { return fail(e); }
}

// --- Content: platforms, links, assets ------------------------------------------

export async function createContentFull(input: ContentInput & {
  /** Every platform this piece targets. */
  platforms?: Platform[];
  /** Reference material: the article, the LinkedIn post, the Drive doc. */
  links?: { url: string; label?: string; kind?: string }[];
  /** Photos, video, thumbnails: a Drive URL or a stored path. */
  assets?: { file_name: string; external_url?: string; storage_path?: string; kind?: string }[];
}): Promise<Result<{ id: string }>> {
  try {
    const { me } = await requirePerson("member");
    const platforms = input.platforms?.length ? input.platforms : [input.platform ?? "linkedin"];

    // One transaction: a dropped link or photo is data loss the person cannot
    // see, so any failure rolls the whole piece back and is raised.
    const id = await asPerson(me.id, async (q) => {
      const [row] = await q<{ id: string }>(
        `insert into mc.content
           (title, kind, platform, status, hook, body, script, notes, caption, cta, pillar,
            owner_id, publish_date, publish_method, source, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         returning id`,
        [
          input.title.trim(),
          input.kind ?? "post",
          // The first selected platform is the primary one.
          platforms[0],
          input.status ?? "idea",
          input.hook ?? null,
          input.body ?? null,
          input.script ?? null,
          input.notes ?? null,
          input.caption ?? null,
          input.cta ?? null,
          input.pillar ?? null,
          input.owner_id ?? me.id,
          input.publish_date ?? null,
          input.publish_method ?? "manual",
          input.source ?? "manual",
          me.id,
        ],
      );

      await q(
        `insert into mc.content_platforms (content_id, platform)
         select $1, p from unnest($2::mc.platform[]) as p`,
        [row.id, platforms],
      );

      if (input.links?.length) {
        await q(
          `insert into mc.content_links (content_id, url, label, kind, sort_order)
           select $1, x.url, x.label, x.kind, x.sort_order
             from jsonb_to_recordset($2::jsonb) as x(url text, label text, kind text, sort_order int)`,
          [
            row.id,
            JSON.stringify(input.links.map((l, i) => ({
              url: l.url.trim(), label: l.label ?? null, kind: l.kind ?? "reference", sort_order: i,
            }))),
          ],
        );
      }

      if (input.assets?.length) {
        await q(
          `insert into mc.content_assets (content_id, file_name, external_url, storage_path, kind, uploaded_by)
           select $1, x.file_name, x.external_url, x.storage_path, x.kind, $3
             from jsonb_to_recordset($2::jsonb)
               as x(file_name text, external_url text, storage_path text, kind text)`,
          [
            row.id,
            JSON.stringify(input.assets.map((a) => ({
              file_name: a.file_name,
              external_url: a.external_url ?? null,
              storage_path: a.storage_path ?? null,
              kind: a.kind ?? "file",
            }))),
            me.id,
          ],
        );
      }

      return row.id;
    });

    revalidatePath("/content");
    await flushSlack();
    return { ok: true, data: { id } };
  } catch (e) { return fail(e); }
}

export async function setContentPlatforms(contentId: string, platforms: Platform[]): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    await asPerson(me.id, async (q) => {
      // Only the deselected platforms go. The original deleted every row and
      // re-inserted, which wiped the published link and dates on the
      // platforms that stayed selected.
      await q(
        `delete from mc.content_platforms where content_id = $1 and platform <> all($2::mc.platform[])`,
        [contentId, platforms],
      );
      if (platforms.length) {
        await q(
          `insert into mc.content_platforms (content_id, platform)
           select $1, p from unnest($2::mc.platform[]) as p
           on conflict (content_id, platform) do nothing`,
          [contentId, platforms],
        );
        // Keep the primary in step with the first selection.
        await q(`update mc.content set platform = $2::mc.platform where id = $1`, [contentId, platforms[0]]);
      }
    });
    revalidatePath("/content");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function addContentLink(
  contentId: string, url: string, label?: string, kind = "reference",
): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    await asPerson(me.id, (q) =>
      q(
        `insert into mc.content_links (content_id, url, label, kind, sort_order)
         values ($1, $2, $3, $4, (select count(*) from mc.content_links where content_id = $1))`,
        [contentId, url.trim(), label ?? null, kind],
      ),
    );
    revalidatePath("/content");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function removeContentLink(id: string): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    await asPerson(me.id, (q) => q(`delete from mc.content_links where id = $1`, [id]));
    revalidatePath("/content");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function addContentAsset(input: {
  content_id: string;
  file_name: string;
  external_url?: string;
  storage_path?: string;
  kind?: string;
}): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    await asPerson(me.id, (q) =>
      q(
        `insert into mc.content_assets (content_id, file_name, external_url, storage_path, kind, uploaded_by)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          input.content_id,
          input.file_name.trim(),
          input.external_url ?? null,
          input.storage_path ?? null,
          input.kind ?? "file",
          me.id,
        ],
      ),
    );
    revalidatePath("/content");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/**
 * The drawer is a client component, so it reaches its sub-resources through
 * an action rather than importing the server query directly.
 */
export async function loadContentDetail(id: string) {
  const { getContentDetail } = await import("@/lib/server/ops/queries");
  return getContentDetail(id);
}

// --- Content media (spec §1-14, §30) -----------------------------------------

/**
 * Record a media asset.
 *
 * There is no object storage here, so an asset is a link: a Drive, Canva or
 * YouTube URL the team already hosts. The row carries the URL and whatever
 * metadata the caller knows; nothing is uploaded through a serverless function.
 */
export async function attachContentAsset(input: {
  content_id: string;
  file_name: string;
  external_url: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  stage?: "reference" | "raw" | "edited" | "final" | "supporting";
  display_name?: string | null;
  duration_s?: number | null;
  width?: number | null;
  height?: number | null;
}): Promise<Result<{ id: string }>> {
  try {
    const { me } = await requirePerson("member");

    // The URL is rendered as a link and a preview, so only web addresses.
    const raw = input.external_url.trim();
    const url = URL.canParse(raw) ? new URL(raw) : null;
    if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) {
      return { ok: false, error: "Paste a full web link, starting with https://" };
    }

    const mime = input.mime_type ?? null;
    const kind = mime?.startsWith("image/") ? "image"
      : mime?.startsWith("video/") ? "video"
      : mime?.startsWith("audio/") ? "audio" : "file";

    const [row] = await asPerson(me.id, (q) =>
      q<{ id: string }>(
        `insert into mc.content_assets
           (content_id, file_name, display_name, external_url, mime_type, size_bytes, kind, stage,
            duration_s, width, height, uploaded_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         returning id`,
        [
          input.content_id,
          input.file_name.trim() || url.hostname,
          input.display_name ?? null,
          url.toString(),
          mime,
          input.size_bytes ?? null,
          kind,
          input.stage ?? "supporting",
          input.duration_s ?? null,
          input.width ?? null,
          input.height ?? null,
          me.id,
        ],
      ),
    );

    revalidatePath("/content");
    return { ok: true, data: { id: row.id } };
  } catch (e) { return fail(e); }
}

/** Change an asset's stage, approval, name, or primary flag. */
export async function updateContentAsset(
  id: string,
  patch: {
    stage?: string; approval?: string; display_name?: string | null;
    is_primary?: boolean;
  },
): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    const set = setClause(patch, ["stage", "approval", "display_name", "is_primary"], 2);
    if (set.empty) return { ok: true };
    const rows = await asPerson(me.id, (q) =>
      q(`update mc.content_assets set ${set.sql} where id = $1 returning id`, [id, ...set.values]),
    );
    { const w = wrote(rows, "asset"); if (!w.ok) return w; }
    revalidatePath("/content");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/**
 * Remove an asset.
 *
 * §33: this removes the asset, never the content item. Assets are links, so
 * there is no stored file to clean up: the row is the whole asset.
 */
export async function removeContentAsset(id: string): Promise<Result> {
  try {
    const { me } = await requirePerson("member");
    await asPerson(me.id, (q) => q(`delete from mc.content_assets where id = $1`, [id]));
    revalidatePath("/content");
    return { ok: true };
  } catch (e) { return fail(e); }
}

/**
 * Viewable URLs for assets, keyed by storage path (§45).
 *
 * Kept for the callers written against private storage. With no bucket there
 * is nothing to sign: an asset's URL is its stored external URL, returned
 * unchanged, and a path with no external URL behind it has no URL, so it is
 * left out of the map.
 */
export async function signAssetUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  try {
    if (!(await currentPerson())) return {};
    const rows = await opsQuery<{ storage_path: string; external_url: string }>(
      `select storage_path, external_url from mc.content_assets
        where storage_path = any($1::text[]) and external_url is not null`,
      [paths],
    );
    return Object.fromEntries(rows.map((r) => [r.storage_path, r.external_url]));
  } catch {
    return {};
  }
}
