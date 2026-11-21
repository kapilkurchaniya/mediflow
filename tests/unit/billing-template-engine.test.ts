import { describe, expect, it } from "vitest";
import {
  getSampleBillingContext,
  renderBillingTemplate,
  sanitizeBillingTemplateHtml,
} from "@/server/domain/sales/template-engine";

describe("sanitizeBillingTemplateHtml", () => {
  it("strips dangerous tags, event handlers, and javascript: URIs", () => {
    const dirty = `
      <div onclick="alert(1)" onload="steal()">
        <script>alert('xss')</script>
        <iframe src="https://evil.test"></iframe>
        <a href="javascript:alert(2)">Click</a>
        <p style="width: expression(alert(3)); color: red;">Total</p>
      </div>
    `;
    const clean = sanitizeBillingTemplateHtml(dirty);

    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("<iframe");
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("onload");
    expect(clean).not.toContain("javascript:");
    expect(clean).not.toContain("expression(");
    expect(clean).toContain("Total");
  });
});

describe("renderBillingTemplate", () => {
  it("renders store, sale, totals, conditionals, and line items with HTML escaping", () => {
    const ctx = getSampleBillingContext();
    ctx.sale.customerName = "Ramesh <script>alert(1)</script> & Sons";
    ctx.sale.isCancelled = true;

    const template = `
      <div>
        <h1>{{store.name}}</h1>
        <p>Customer: {{sale.customerName}}</p>
        {{#if sale.isCancelled}}<span class="cancelled">CANCELLED</span>{{/if}}
        {{#if gst.irn}}<p>IRN: {{gst.irn}}</p>{{/if}}
        <table>
          <tbody>
            {{#each items}}
            <tr><td>{{sno}}</td><td>{{name}}</td><td>{{batchNo}}</td><td>{{amount}}</td></tr>
            {{/each}}
          </tbody>
        </table>
        <strong>{{totals.grandTotal}}</strong>
      </div>
    `;

    const rendered = renderBillingTemplate(template, ctx);

    expect(rendered).toContain("MediFlow Pharmacy — Main Branch");
    expect(rendered).toContain("Ramesh &lt;script&gt;alert(1)&lt;/script&gt; &amp; Sons");
    expect(rendered).toContain('<span class="cancelled">CANCELLED</span>');
    expect(rendered).not.toContain("IRN:");
    expect(rendered).toContain("<td>1</td><td>Dolo 650mg Tablet</td><td>DL2609</td><td>₹64.00</td>");
    expect(rendered).toContain("<td>2</td><td>Augmentin 625 Duo</td><td>AG8812</td><td>₹216.00</td>");
    expect(rendered).toContain("<strong>₹280.00</strong>");
  });
});

