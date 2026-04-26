import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/server/auth/middleware";
import { getEndpointById, updateEndpoint, deleteEndpoint } from "@/server/db/queries";
import { z } from "zod";

const updateEndpointSchema = z.object({
  url: z.string().url().optional(),
  description: z.string().max(500).optional(),
  customHeaders: z.record(z.string(), z.string()).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const endpoint = await getEndpointById(id);

  if (!endpoint) {
    return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: endpoint.id,
    url: endpoint.url,
    description: endpoint.description,
    status: endpoint.status,
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const endpoint = await getEndpointById(id);
  if (!endpoint) {
    return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = updateEndpointSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updated = await updateEndpoint(id, parsed.data);
  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const endpoint = await getEndpointById(id);
  if (!endpoint) {
    return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });
  }

  await deleteEndpoint(id);
  return new NextResponse(null, { status: 204 });
}
