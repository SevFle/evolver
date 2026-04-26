import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiKey } from "@/server/auth/middleware";
import {
  createEndpoint,
  getEndpointsByUserId,
  getEndpointById,
  updateEndpoint,
  deleteEndpoint,
} from "@/server/db/queries";

const createEndpointSchema = z.object({
  url: z.string().url("Must be a valid URL"),
  description: z.string().max(500).optional(),
  customHeaders: z.record(z.string(), z.string()).optional(),
});

const updateEndpointSchema = z.object({
  url: z.string().url("Must be a valid URL").optional(),
  description: z.string().max(500).optional(),
  customHeaders: z.record(z.string(), z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createEndpointSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const endpoint = await createEndpoint(auth.userId, parsed.data);

  return NextResponse.json(
    {
      id: endpoint.id,
      url: endpoint.url,
      description: endpoint.description,
      signingSecret: endpoint.signingSecret,
      status: endpoint.status,
      createdAt: endpoint.createdAt,
    },
    { status: 201 },
  );
}

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const endpointList = await getEndpointsByUserId(auth.userId);

  return NextResponse.json(
    endpointList.map((e) => ({
      id: e.id,
      url: e.url,
      description: e.description,
      status: e.status,
      createdAt: e.createdAt,
    })),
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}
