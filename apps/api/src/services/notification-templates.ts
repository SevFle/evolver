import type { MilestoneType } from "@shiplens/shared";

export interface NotificationTemplate {
  milestoneType: MilestoneType;
  subject: string;
  body: string;
}

const TEMPLATES: Record<MilestoneType, NotificationTemplate> = {
  booked: {
    milestoneType: "booked",
    subject: "Shipment {{trackingId}} has been booked",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #2563EB; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Shipment Booked</h1>
  </div>
  <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="font-size: 16px; color: #374151;">Your shipment has been booked and is being prepared.</p>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px 0; color: #6b7280;">Tracking ID</td><td style="padding: 8px 0; font-weight: bold;">{{trackingId}}</td></tr>
      <tr><td style="padding: 8px 0; color: #6b7280;">Origin</td><td style="padding: 8px 0;">{{origin}}</td></tr>
      <tr><td style="padding: 8px 0; color: #6b7280;">Destination</td><td style="padding: 8px 0;">{{destination}}</td></tr>
      <tr><td style="padding: 8px 0; color: #6b7280;">Carrier</td><td style="padding: 8px 0;">{{carrier}}</td></tr>
    </table>
    <a href="{{trackingUrl}}" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #2563EB; color: white; text-decoration: none; border-radius: 6px;">Track Shipment</a>
  </div>
  <div style="padding: 12px 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="margin: 0; color: #9ca3af; font-size: 12px;">{{companyName}}</p>
  </div>
</div>`,
  },
  picked_up: {
    milestoneType: "picked_up",
    subject: "Shipment {{trackingId}} has been picked up",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #2563EB; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Shipment Picked Up</h1>
  </div>
  <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="font-size: 16px; color: #374151;">Your shipment has been picked up and is on its way.</p>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px 0; color: #6b7280;">Tracking ID</td><td style="padding: 8px 0; font-weight: bold;">{{trackingId}}</td></tr>
      <tr><td style="padding: 8px 0; color: #6b7280;">Location</td><td style="padding: 8px 0;">{{location}}</td></tr>
      <tr><td style="padding: 8px 0; color: #6b7280;">Time</td><td style="padding: 8px 0;">{{timestamp}}</td></tr>
    </table>
    <a href="{{trackingUrl}}" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #2563EB; color: white; text-decoration: none; border-radius: 6px;">Track Shipment</a>
  </div>
  <div style="padding: 12px 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="margin: 0; color: #9ca3af; font-size: 12px;">{{companyName}}</p>
  </div>
</div>`,
  },
  departed_origin: {
    milestoneType: "departed_origin",
    subject: "Shipment {{trackingId}} has departed",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #2563EB; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Shipment Departed</h1>
  </div>
  <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="font-size: 16px; color: #374151;">Your shipment has departed from the origin.</p>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px 0; color: #6b7280;">Tracking ID</td><td style="padding: 8px 0; font-weight: bold;">{{trackingId}}</td></tr>
      <tr><td style="padding: 8px 0; color: #6b7280;">From</td><td style="padding: 8px 0;">{{origin}}</td></tr>
      <tr><td style="padding: 8px 0; color: #6b7280;">To</td><td style="padding: 8px 0;">{{destination}}</td></tr>
      <tr><td style="padding: 8px 0; color: #6b7280;">Carrier</td><td style="padding: 8px 0;">{{carrier}}</td></tr>
    </table>
    <a href="{{trackingUrl}}" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #2563EB; color: white; text-decoration: none; border-radius: 6px;">Track Shipment</a>
  </div>
  <div style="padding: 12px 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="margin: 0; color: #9ca3af; font-size: 12px;">{{companyName}}</p>
  </div>
</div>`,
  },
  in_transit: {
    milestoneType: "in_transit",
    subject: "Shipment {{trackingId}} is in transit",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #2563EB; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">In Transit</h1>
  </div>
  <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="font-size: 16px; color: #374151;">Your shipment is currently in transit to its destination.</p>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px 0; color: #6b7280;">Tracking ID</td><td style="padding: 8px 0; font-weight: bold;">{{trackingId}}</td></tr>
      <tr><td style="padding: 8px 0; color: #6b7280;">Current Location</td><td style="padding: 8px 0;">{{location}}</td></tr>
      <tr><td style="padding: 8px 0; color: #6b7280;">ETA</td><td style="padding: 8px 0;">{{eta}}</td></tr>
    </table>
    <a href="{{trackingUrl}}" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #2563EB; color: white; text-decoration: none; border-radius: 6px;">Track Shipment</a>
  </div>
  <div style="padding: 12px 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="margin: 0; color: #9ca3af; font-size: 12px;">{{companyName}}</p>
  </div>
</div>`,
  },
  arrived_port: {
    milestoneType: "arrived_port",
    subject: "Shipment {{trackingId}} has arrived at port",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #2563EB; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Arrived at Port</h1>
  </div>
  <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="font-size: 16px; color: #374151;">Your shipment has arrived at the destination port.</p>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px 0; color: #6b7280;">Tracking ID</td><td style="padding: 8px 0; font-weight: bold;">{{trackingId}}</td></tr>
      <tr><td style="padding: 8px 0; color: #6b7280;">Port</td><td style="padding: 8px 0;">{{location}}</td></tr>
      <tr><td style="padding: 8px 0; color: #6b7280;">Arrival Time</td><td style="padding: 8px 0;">{{timestamp}}</td></tr>
    </table>
    <a href="{{trackingUrl}}" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #2563EB; color: white; text-decoration: none; border-radius: 6px;">Track Shipment</a>
  </div>
  <div style="padding: 12px 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="margin: 0; color: #9ca3af; font-size: 12px;">{{companyName}}</p>
  </div>
</div>`,
  },
  customs_cleared: {
    milestoneType: "customs_cleared",
    subject: "Shipment {{trackingId}} cleared customs",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #16a34a; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Customs Cleared</h1>
  </div>
  <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="font-size: 16px; color: #374151;">Your shipment has cleared customs and will continue to its destination.</p>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px 0; color: #6b7280;">Tracking ID</td><td style="padding: 8px 0; font-weight: bold;">{{trackingId}}</td></tr>
      <tr><td style="padding: 8px 0; color: #6b7280;">Location</td><td style="padding: 8px 0;">{{location}}</td></tr>
    </table>
    <a href="{{trackingUrl}}" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #16a34a; color: white; text-decoration: none; border-radius: 6px;">Track Shipment</a>
  </div>
  <div style="padding: 12px 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="margin: 0; color: #9ca3af; font-size: 12px;">{{companyName}}</p>
  </div>
</div>`,
  },
  departed_terminal: {
    milestoneType: "departed_terminal",
    subject: "Shipment {{trackingId}} departed terminal",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #2563EB; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Departed Terminal</h1>
  </div>
  <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="font-size: 16px; color: #374151;">Your shipment has departed the terminal and is heading to final delivery.</p>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px 0; color: #6b7280;">Tracking ID</td><td style="padding: 8px 0; font-weight: bold;">{{trackingId}}</td></tr>
      <tr><td style="padding: 8px 0; color: #6b7280;">Terminal</td><td style="padding: 8px 0;">{{location}}</td></tr>
      <tr><td style="padding: 8px 0; color: #6b7280;">Destination</td><td style="padding: 8px 0;">{{destination}}</td></tr>
    </table>
    <a href="{{trackingUrl}}" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #2563EB; color: white; text-decoration: none; border-radius: 6px;">Track Shipment</a>
  </div>
  <div style="padding: 12px 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="margin: 0; color: #9ca3af; font-size: 12px;">{{companyName}}</p>
  </div>
</div>`,
  },
  out_for_delivery: {
    milestoneType: "out_for_delivery",
    subject: "Shipment {{trackingId}} is out for delivery",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #d97706; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Out for Delivery</h1>
  </div>
  <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="font-size: 16px; color: #374151;">Your shipment is out for delivery and will arrive soon.</p>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px 0; color: #6b7280;">Tracking ID</td><td style="padding: 8px 0; font-weight: bold;">{{trackingId}}</td></tr>
      <tr><td style="padding: 8px 0; color: #6b7280;">Destination</td><td style="padding: 8px 0;">{{destination}}</td></tr>
    </table>
    <a href="{{trackingUrl}}" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #d97706; color: white; text-decoration: none; border-radius: 6px;">Track Shipment</a>
  </div>
  <div style="padding: 12px 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="margin: 0; color: #9ca3af; font-size: 12px;">{{companyName}}</p>
  </div>
</div>`,
  },
  delivered: {
    milestoneType: "delivered",
    subject: "Shipment {{trackingId}} has been delivered",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #16a34a; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Delivered!</h1>
  </div>
  <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="font-size: 16px; color: #374151;">Your shipment has been delivered successfully.</p>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px 0; color: #6b7280;">Tracking ID</td><td style="padding: 8px 0; font-weight: bold;">{{trackingId}}</td></tr>
      <tr><td style="padding: 8px 0; color: #6b7280;">Delivered To</td><td style="padding: 8px 0;">{{destination}}</td></tr>
      <tr><td style="padding: 8px 0; color: #6b7280;">Delivery Time</td><td style="padding: 8px 0;">{{timestamp}}</td></tr>
    </table>
    <a href="{{trackingUrl}}" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #16a34a; color: white; text-decoration: none; border-radius: 6px;">View Details</a>
  </div>
  <div style="padding: 12px 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="margin: 0; color: #9ca3af; font-size: 12px;">{{companyName}}</p>
  </div>
</div>`,
  },
  exception: {
    milestoneType: "exception",
    subject: "Alert: Issue with shipment {{trackingId}}",
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #dc2626; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Shipment Alert</h1>
  </div>
  <div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="font-size: 16px; color: #374151;">There is an issue with your shipment that requires attention.</p>
    <table style="width: 100%; border-collapse: collapse;">
      <tr><td style="padding: 8px 0; color: #6b7280;">Tracking ID</td><td style="padding: 8px 0; font-weight: bold;">{{trackingId}}</td></tr>
      <tr><td style="padding: 8px 0; color: #6b7280;">Details</td><td style="padding: 8px 0; color: #dc2626;">{{description}}</td></tr>
      <tr><td style="padding: 8px 0; color: #6b7280;">Location</td><td style="padding: 8px 0;">{{location}}</td></tr>
    </table>
    <a href="{{trackingUrl}}" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #dc2626; color: white; text-decoration: none; border-radius: 6px;">View Details</a>
  </div>
  <div style="padding: 12px 20px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="margin: 0; color: #9ca3af; font-size: 12px;">{{companyName}}</p>
  </div>
</div>`,
  },
};

export interface TemplateContext {
  trackingId: string;
  origin?: string;
  destination?: string;
  carrier?: string;
  customerName?: string;
  location?: string;
  description?: string;
  timestamp?: string;
  eta?: string;
  trackingUrl?: string;
  companyName?: string;
  primaryColor?: string;
}

export function getTemplate(milestoneType: MilestoneType): NotificationTemplate {
  return TEMPLATES[milestoneType];
}

export function getAllTemplates(): NotificationTemplate[] {
  return Object.values(TEMPLATES);
}

export function renderTemplate(template: string, context: TemplateContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: keyof TemplateContext) => {
    const value = context[key];
    return value ?? match;
  });
}

export function renderSubject(milestoneType: MilestoneType, context: TemplateContext): string {
  const template = TEMPLATES[milestoneType];
  return renderTemplate(template.subject, context);
}

export function renderBody(milestoneType: MilestoneType, context: TemplateContext): string {
  const template = TEMPLATES[milestoneType];
  const primaryColor = context.primaryColor ?? "#2563EB";
  const rendered = renderTemplate(template.body, context);
  return rendered.replace(/#2563EB/g, primaryColor);
}
