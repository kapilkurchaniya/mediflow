import { describe, it, expect } from "vitest";
import {
  getSampleBillingContext,
  renderBillingTemplate,
  sanitizeBillingTemplateHtml,
} from "@/server/domain/sales/template-engine";

describe("Billing template engine", () => {
  it("renders store, sale, cancellation, and item placeholders safely", () => {
    const ctx = getSampleBillingContext();
    ctx.sale.isCancelled = true;
    ctx.sale.cancelledAt = "23 Nov 2026, 11:01 PM";
    ctx.sale.cancelReason = "Accidental purchase";

    const html = `
      <div id="custom-bill-root">
        <h1>{{store.name}}</h1>
        {{#if sale.isCancelled}}
        <p class="cancelled">Cancelled at {{sale.cancelledAt}} ({{sale.cancelReason}})</p>
        {{/if}}
        <ul>{{#each items}}<li>{{this.name}} - {{this.amount}}</li>{{/each}}</ul>
      </div>
    `;

    const rendered = renderBillingTemplate(html, ctx);
    expect(rendered).toContain("MediFlow Pharmacy — Main Branch");
    expect(rendered).toContain("Cancelled at 23 Nov 2026, 11:01 PM (Accidental purchase)");
    expect(rendered).toContain("<li>Dolo 650mg Tablet - ₹64.00</li>");
    expect(rendered).toContain("<li>Augmentin 625 Duo - ₹216.00</li>");
  });

  it("strips dangerous scripts, iframes, and inline event handlers", () => {
    const dirty = `<div id="custom-bill-root" onclick="alert(1)"><script>evil()</script><a href="javascript:alert(2)">Hi</a></div>`;
    const clean = sanitizeBillingTemplateHtml(dirty);
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("javascript:");
  });
});

