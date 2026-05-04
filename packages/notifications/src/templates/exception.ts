import type { EmailTemplate, ShipmentEmailData } from "./types";

export function exceptionTemplate(data: ShipmentEmailData): EmailTemplate {
  const customerGreeting = data.customerName ? `Hi ${data.customerName},` : "Hello,";
  const descLine = data.description ? ` Issue: ${data.description}` : "";
  const locationLine = data.location ? ` at ${data.location}` : "";

  return {
    subject: `Attention: Issue with shipment ${data.trackingId}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #DC2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h1 style="margin: 0;">Delivery Exception</h1>
  </div>
  <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
    <p>${customerGreeting}</p>
    <p>We've detected an issue with your shipment <strong>${data.trackingId}</strong>${locationLine}.${descLine}</p>
    <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 6px; padding: 12px; margin: 16px 0;">
      <p style="margin: 0; color: #991B1B;"><strong>Action may be required.</strong> Please check your shipment details or contact the carrier for more information.</p>
    </div>
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">From</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${data.origin}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">To</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${data.destination}</td></tr>
    </table>
    <a href="#" style="display: inline-block; background: #DC2626; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">View Shipment Details</a>
  </div>
  <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 16px;">ShipLens Tracking Notification</p>
</body>
</html>`,
    text: [
      customerGreeting,
      "",
      `We've detected an issue with your shipment ${data.trackingId}${locationLine}.${descLine}`,
      "",
      "ACTION MAY BE REQUIRED. Please check your shipment details or contact the carrier for more information.",
      "",
      `From: ${data.origin}`,
      `To: ${data.destination}`,
      "",
      "ShipLens Tracking Notification",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
