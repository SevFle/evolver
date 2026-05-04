import type { FastifyInstance } from "fastify";

const DEMO_TRACKING_ID = "SL-E2E-DEMO";

const DEMO_DATA = {
  trackingId: DEMO_TRACKING_ID,
  reference: "PO-2024-00142",
  origin: "Shanghai, CN",
  destination: "Los Angeles, US",
  status: "in_transit",
  carrier: "Maersk",
  serviceType: "FCL",
  estimatedDelivery: "2026-06-15T00:00:00.000Z",
  customerName: "Acme Corp",
  createdAt: "2026-04-20T09:30:00.000Z",
  milestones: [
    {
      type: "in_transit",
      description: "Container loaded on vessel MAERSK SEALAND",
      location: "Pacific Ocean",
      occurredAt: "2026-05-01T14:00:00.000Z",
    },
    {
      type: "departed_origin",
      description: "Vessel departed Shanghai port",
      location: "Shanghai, CN",
      occurredAt: "2026-04-28T08:00:00.000Z",
    },
    {
      type: "customs_cleared",
      description: "Export customs clearance completed",
      location: "Shanghai, CN",
      occurredAt: "2026-04-27T16:30:00.000Z",
    },
    {
      type: "picked_up",
      description: "Container picked up from shipper facility",
      location: "Shanghai, CN",
      occurredAt: "2026-04-25T10:00:00.000Z",
    },
    {
      type: "booked",
      description: "Shipment booked with carrier",
      location: "Shanghai, CN",
      occurredAt: "2026-04-20T09:30:00.000Z",
    },
  ],
  branding: {
    tenantName: "Acme Logistics",
    primaryColor: "#e11d48",
    tagline: "Your cargo, our commitment",
    contactEmail: "support@acmelogistics.com",
    contactPhone: "+1 (555) 123-4567",
    supportUrl: "https://support.acmelogistics.com",
    customFooterText: "Acme Logistics — Global Freight Solutions Since 2010",
  },
};

export async function trackingPageRoutes(server: FastifyInstance) {
  server.get("/:trackingId", async (request, reply) => {
    const { trackingId } = request.params as { trackingId: string };
    if (trackingId === DEMO_TRACKING_ID) {
      return reply.status(200).send({ success: true, data: DEMO_DATA });
    }
    return reply.status(200).send({ success: true, data: { trackingId } });
  });
}
