import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checklistDraftSchema } from "../../../lib/schemas/ai";
import { workflow, drainQueue } from "../../../server/workflow/runtime";
import { getServerEnv } from "../../../server/env";
import { isSameOrigin } from "../../../server/workflow/request";
import { importTrial } from "../../../server/trials/import";
import { RegistryError } from "../../../server/trials/registry";
import { getAiAdapter } from "../../../server/ai";
import { WorkflowError } from "../../../server/workflow/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const action = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("import"),
      nctId: z.string().max(40),
      mode: z.enum(["fixture", "live"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("select"),
      trialId: z.string().regex(/^NCT\d{8}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("approve"),
      id: z.number().int().positive(),
      revision: z.number().int().positive(),
      localOpen: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal("save"),
      id: z.number().int().positive(),
      revision: z.number().int().positive(),
      draft: checklistDraftSchema,
    })
    .strict(),
  z
    .object({ action: z.literal("revise"), id: z.number().int().positive() })
    .strict(),
  z.object({ action: z.enum(["screen", "retry"]) }).strict(),
]);
export async function GET() {
  try {
    const view = workflow().view();
    after(drainQueue);
    return NextResponse.json(view, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Workspace unavailable. Run npm run setup on the server." },
      { status: 503 },
    );
  }
}
export async function POST(request: NextRequest) {
  if (!getServerEnv().DEMO_MODE)
    return NextResponse.json(
      { error: "Synthetic workflow actions require DEMO_MODE=true." },
      { status: 403 },
    );
  if (!isSameOrigin(request))
    return NextResponse.json(
      { error: "Same-origin request required." },
      { status: 403 },
    );
  try {
    const body = action.parse(await request.json()),
      store = workflow();
    if (body.action === "import")
      await importTrial(store, body.nctId, body.mode, () =>
        getAiAdapter(body.mode),
      );
    else if (body.action === "select") store.selectTrial(body.trialId);
    else if (body.action === "approve")
      store.approve(body.id, body.revision, body.localOpen);
    else if (body.action === "save")
      store.save(body.id, body.revision, body.draft);
    else if (body.action === "revise") store.revise(body.id);
    else if (body.action === "screen") store.screen();
    else store.retry();
    after(drainQueue);
    return NextResponse.json(store.view());
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof WorkflowError || error instanceof RegistryError
            ? error.message
            : error instanceof z.ZodError
              ? "Invalid request. Check the submitted criteria."
              : "Action could not be completed. Refresh and try again.",
      },
      {
        status:
          error instanceof WorkflowError || error instanceof RegistryError
            ? error.status
            : error instanceof z.ZodError
              ? 400
              : 500,
      },
    );
  }
}
