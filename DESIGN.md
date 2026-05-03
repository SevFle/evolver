---
version: alpha
name: AutoEvidence
description: "A compliance-automation marketing canvas built around a near-black ground (#000000) and a system of per-feature accent colors — Questionnaire purple, Evidence yellow, Integrations red, AI Copilot cyan, Dashboard blue — that act as identity tokens rather than decorative palette. Display type is hashicorpSans set in 600/700 with tight 1.17–1.21 line-heights; body type runs the same family at 500 weight with relaxed 1.50–1.71 line-heights. Cards live as charcoal surfaces with 1px translucent gray borders; feature showcase cards lift into per-feature chromatic gradients. The system reads as confident, technical, and intentionally multi-feature — every section quietly signals which AutoEvidence capability it represents."

colors:
  primary: "#000000"
  on-primary: "#ffffff"
  accent-blue: "#2b89ff"
  ink: "#ffffff"
  ink-muted: "#b2b6bd"
  ink-subtle: "#656a76"
  canvas: "#000000"
  surface-1: "#15181e"
  surface-2: "#1f232b"
  surface-3: "#3b3d45"
  hairline: "#3b3d45"
  hairline-soft: "#252830"
  inverse-canvas: "#ffffff"
  inverse-ink: "#000000"
  feature-questionnaire: "#7b42bc"
  feature-questionnaire-bright: "#911ced"
  feature-evidence: "#ffcf25"
  feature-integrations: "#e62b1e"
  feature-ai-copilot: "#14c6cb"
  feature-ai-copilot-deep: "#12b6bb"
  feature-dashboard: "#1868f2"
  feature-sync: "#00ca8e"
  feature-alerts: "#f24c53"
  amber-100: "#fbeabf"
  amber-200: "#bb5a00"
  blue-7: "#101a59"
  semantic-success: "#00ca8e"
  semantic-warning: "#ffcf25"
  semantic-error: "#e62b1e"
  semantic-visited: "#a737ff"

typography:
  display-xl:
    fontFamily: hashicorpSans
    fontSize: 80px
    fontWeight: 700
    lineHeight: 1.17
    letterSpacing: -2.5px
  display-lg:
    fontFamily: hashicorpSans
    fontSize: 56px
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: -1.6px
  display-md:
    fontFamily: hashicorpSans
    fontSize: 40px
    fontWeight: 600
    lineHeight: 1.19
    letterSpacing: -1.0px
  headline:
    fontFamily: hashicorpSans
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.21
    letterSpacing: -0.6px
  card-title:
    fontFamily: hashicorpSans
    fontSize: 22px
    fontWeight: 600
    lineHeight: 1.18
    letterSpacing: -0.4px
  subhead:
    fontFamily: hashicorpSans
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: -0.2px
  body-lg:
    fontFamily: hashicorpSans
    fontSize: 18px
    fontWeight: 500
    lineHeight: 1.69
    letterSpacing: 0
  body:
    fontFamily: hashicorpSans
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.50
    letterSpacing: 0
  body-sm:
    fontFamily: hashicorpSans
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.71
    letterSpacing: 0
  caption:
    fontFamily: hashicorpSans
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.38
    letterSpacing: 0.2px
  button:
    fontFamily: hashicorpSans
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.29
    letterSpacing: 0
  eyebrow:
    fontFamily: hashicorpSans
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.23
    letterSpacing: 0.6px

rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  xxl: 24px
  pill: 9999px
  full: 9999px

spacing:
  hair: 1px
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 96px

components:
  button-primary:
    backgroundColor: "{colors.inverse-canvas}"
    textColor: "{colors.inverse-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 10px 18px
  button-primary-pressed:
    backgroundColor: "{colors.inverse-canvas}"
    textColor: "{colors.inverse-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 10px 18px
  button-tertiary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 10px 18px
  button-feature-questionnaire:
    backgroundColor: "{colors.feature-questionnaire}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 10px 18px
  button-feature-evidence:
    backgroundColor: "{colors.feature-evidence}"
    textColor: "{colors.inverse-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 10px 18px
  button-feature-ai-copilot:
    backgroundColor: "{colors.feature-ai-copilot}"
    textColor: "{colors.inverse-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.md}"
    padding: 10px 18px
  feature-card:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 24px
  feature-card-questionnaire:
    backgroundColor: "{colors.feature-questionnaire}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 24px
  feature-card-evidence:
    backgroundColor: "{colors.feature-evidence}"
    textColor: "{colors.inverse-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 24px
  feature-card-ai-copilot:
    backgroundColor: "{colors.feature-ai-copilot}"
    textColor: "{colors.inverse-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 24px
  generic-card:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 24px
  pricing-card:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 32px
  pricing-card-featured:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: 32px
  resource-card:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.lg}"
    padding: 16px
  text-input:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 10px 14px
  text-input-focused:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: 10px 14px
  feature-pill:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: 4px 10px
  top-nav:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.xs}"
    height: 64px
  comparison-row:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.xs}"
  cta-banner:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    typography: "{typography.subhead}"
    rounded: "{rounded.xxl}"
    padding: 48px
  footer:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.xs}"
    padding: 64px 32px
---

## Overview

AutoEvidence's marketing canvas is a near-black ground that serves a multi-feature SaaS platform without ever feeling generic. The dominant surface is `{colors.canvas}` (pure black) layered with `{colors.surface-1}` charcoal cards and 1px translucent gray hairlines. The chrome is monochrome — white pill-rounded buttons (`{components.button-primary}`), white type, gray secondary type — but the system is held together by a **palette of per-feature accent colors** that signal which AutoEvidence capability a given section belongs to: Questionnaire purple, Evidence yellow, Integrations red, AI Copilot cyan, Dashboard blue, Sync green, Alerts coral.

Display type is **hashicorpSans** at weights 600/700 with tight line-heights (1.17–1.21); body type is the same family at 500 weight with deliberately relaxed line-heights (1.50–1.71) — the contrast feels editorial, not enterprise-templated. CTAs use small `{rounded.md}` 8px corners rather than pills, which keeps the system reading as developer-facing rather than consumer-y.

The signature device is the **feature-card** family — each AutoEvidence module gets its own colored card variant on the home and application pages, lifting Questionnaires into a violet ground, Evidence into yellow, AI Copilot into cyan. These aren't decorative gradients — they're identity surfaces. A reader scrolling the page can tell which capability a section is about from the corner of their eye.

**Key Characteristics:**
- Black-canvas marketing system: `{colors.canvas}` is the surface for hero, body, pricing, comparison tables, and footer alike.
- **Per-feature color identity**: Questionnaire `{colors.feature-questionnaire}`, Evidence `{colors.feature-evidence}`, AI Copilot `{colors.feature-ai-copilot}`, Dashboard `{colors.feature-dashboard}`, Integrations `{colors.feature-integrations}`, Sync `{colors.feature-sync}`, Alerts `{colors.feature-alerts}` — each with its own button + card variant.
- Display headlines run hashicorpSans 600/700 with line-height 1.17–1.21 (tight); body runs the same family at 500 with 1.50–1.71 (relaxed) — the proportional gap is the brand's voice.
- CTA shape is `{rounded.md}` 8px — not a pill — keeping the system reading as developer-tool rather than consumer-app.
- Charcoal surface lift (canvas → surface-1 → surface-2) instead of shadow-driven elevation.
- 1px translucent gray hairlines (`rgba(178,182,189,0.1)
