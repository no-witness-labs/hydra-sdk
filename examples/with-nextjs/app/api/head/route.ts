import { NextResponse } from "next/server";
import * as hydra from "@/lib/hydra";

/** GET /api/head — returns current head state. */
export async function GET() {
  return NextResponse.json(hydra.getState());
}

/** POST /api/head — execute a head action. Body: { action: "connect" | "init" | "commit" | "close" | "fanout" | "abort" | "disconnect" } */
export async function POST(req: Request) {
  try {
    const { action } = (await req.json()) as { action: string };

    switch (action) {
      case "connect":
        return NextResponse.json(await hydra.connect());
      case "disconnect":
        await hydra.disconnect();
        return NextResponse.json({ state: "Disconnected" });
      case "init":
        return NextResponse.json(await hydra.init());
      case "commit":
        return NextResponse.json(await hydra.blueprintCommit());
      case "close":
        return NextResponse.json(await hydra.close());
      case "fanout":
        return NextResponse.json(await hydra.fanout());
      case "abort":
        return NextResponse.json(await hydra.abort());
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
