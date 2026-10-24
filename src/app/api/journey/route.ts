import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { journeyActionSchema } from "../../../lib/journey";
import { JourneyStore } from "../../../server/workflow/journey";
import { WorkflowError } from "../../../server/workflow/store";
import {
  workflow,
  workflowView,
  drainQueue,
} from "../../../server/workflow/runtime";
import { getServerEnv } from "../../../server/env";
import { isSameOrigin } from "../../../server/workflow/request";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (!getServerEnv().DEMO_MODE || !isSameOrigin(request))
    return NextResponse.json(
      { error: "Same-origin synthetic demo actions only." },
      { status: 403 },
    );
  try {
    const action = journeyActionSchema.parse(await request.json());
    new JourneyStore(workflow()).action(action);
    after(drainQueue);
    return NextResponse.json(workflowView(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof WorkflowError
            ? error.message
            : error instanceof z.ZodError
              ? "Check the required fields and try again."
              : "Action failed. Refresh and try again.",
      },
      {
        status:
          error instanceof WorkflowError
            ? error.status
            : error instanceof z.ZodError
              ? 400
              : 500,
      },
    );
  }
}
