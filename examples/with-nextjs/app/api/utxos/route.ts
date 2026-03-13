import { NextResponse } from "next/server";

import * as hydra from "@/lib/hydra";

/** GET /api/utxos — returns L2 snapshot UTxOs. */
export async function GET() {
  try {
    const utxos = await hydra.getSnapshotUtxos();
    return NextResponse.json({ utxos });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
