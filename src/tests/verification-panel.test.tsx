import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { VerificationPanel, EvidencePanel } from "../../src/components/panels";
import { normalizeVerification } from "../../src/lib/verification";
import { humanLabel, humanValue, readableRows, initials } from "../../src/lib/format";
import { ErrorBoundary } from "../../src/components/error-boundary";

const render = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("VerificationPanel — must never crash on any verification shape", () => {
  it("renders fully-loaded verification data", () => {
    const html = render(
      <VerificationPanel
        verification={{
          overall: "passed",
          checks: [
            { name: "refund_record_exists", expected: true, actual: true, pass: true },
            { name: "payment_status_refunded", expected: "refunded", actual: "refunded", pass: true },
          ],
          detail: "Refund RF-10291 verified",
        }}
      />,
    );
    expect(html).toContain("passed");
    expect(html).toContain("refund_record_exists");
    expect(html).toContain("RF-10291");
  });

  it("renders a loading state when verification is undefined", () => {
    const html = render(<VerificationPanel verification={undefined} />);
    expect(html).toContain("Awaiting verification");
  });

  it("renders a loading state when verification is null", () => {
    const html = render(<VerificationPanel verification={null} />);
    expect(html).toContain("Awaiting verification");
  });

  it("does not crash when verification is an empty object {} (DB default jsonb)", () => {
    const html = render(<VerificationPanel verification={{} as never} />);
    expect(html).toContain("No verification events available yet.");
  });

  it("does not crash when checks is missing but overall/detail exist", () => {
    const html = render(<VerificationPanel verification={{ overall: "passed", checks: undefined as never, detail: "done" } as never} />);
    expect(html).toContain("passed");
    expect(html).toContain("done");
  });

  it("does not crash when checks is an empty array", () => {
    const html = render(<VerificationPanel verification={{ overall: "failed", checks: [], detail: "failed" }} />);
    expect(html).toContain("failed");
    expect(html).toContain("No verification checks recorded.");
  });

  it("handles a partial realtime payload (checks present, no overall)", () => {
    const html = render(
      <VerificationPanel
        verification={{ checks: [{ name: "c1", expected: true, actual: true, pass: true }] } as never}
      />,
    );
    expect(html).toContain("unknown");
    expect(html).toContain("c1");
  });

  it("treats an empty backend array as no verification", () => {
    const html = render(<VerificationPanel verification={[] as never} />);
    expect(html).toContain("No verification events available yet.");
  });
});

describe("normalizeVerification boundary helper", () => {
  it("normalizes {} to null", () => {
    expect(normalizeVerification({})).toBeNull();
  });
  it("normalizes undefined/null to null", () => {
    expect(normalizeVerification(undefined)).toBeNull();
    expect(normalizeVerification(null)).toBeNull();
  });
  it("normalizes a full record and always provides an array of checks", () => {
    const n = normalizeVerification({ overall: "passed", checks: [{ name: "a", expected: true, actual: true, pass: true }], detail: "ok" });
    expect(n?.checks).toEqual(expect.any(Array));
    expect(n?.overall).toBe("passed");
  });
});

describe("EvidencePanel — safe with missing collections", () => {
  it("renders an empty state instead of crashing when evidence is undefined", () => {
    const html = render(<EvidencePanel evidence={undefined as never} />);
    expect(html).toContain("No evidence collected yet.");
  });

  it("renders facts when evidence is provided", () => {
    const html = render(
      <EvidencePanel
        evidence={[{ id: "e1", source: "payments", type: "payment", label: "TXN-1 succeeded", value: "TXN-1", known: true }]}
      />,
    );
    expect(html).toContain("TXN-1");
    expect(html).toContain("FACT");
  });
});

describe("readable formatting helpers (no raw JSON in UI)", () => {
  it("humanLabel converts internal keys to readable labels", () => {
    expect(humanLabel("automation_paused")).toBe("Automation Paused");
    expect(humanLabel("duplicate_payment")).toBe("Duplicate Payment");
    expect(humanLabel("")).toBe("Not available");
  });
  it("humanValue formats booleans/null/objects readably", () => {
    expect(humanValue(true)).toBe("Yes");
    expect(humanValue(false)).toBe("No");
    expect(humanValue(null)).toBe("Not available");
    expect(humanValue(undefined)).toBe("Not available");
    expect(humanValue({ a: 1, b: "x" })).toContain("A: 1");
  });
  it("readableRows never throws on non-object input", () => {
    expect(readableRows(undefined)).toEqual([]);
    expect(readableRows(null)).toEqual([]);
    expect(readableRows("nope" as never)).toEqual([]);
    expect(readableRows({ duplicate: true, amount: 2499 })).toContainEqual({ label: "Duplicate", value: "Yes" });
  });
  it("initials derive from a display name", () => {
    expect(initials("Ranganath Swamy")).toBe("RS");
    expect(initials("R. Kumar")).toBe("RK");
    expect(initials("")).toBe("?");
  });
});

describe("ErrorBoundary — per-panel isolation (no cross-panel contamination)", () => {
  it("derives a panel error state from a thrown error (contextual label available)", () => {
    const state = (ErrorBoundary as unknown as { getDerivedStateFromError: (e: unknown) => unknown }).getDerivedStateFromError(new Error("boom"));
    expect(state).toEqual({ hasError: true, message: "boom" });
  });
  it("a clean instance renders its children — no shared/global error state", () => {
    const clean = render(<ErrorBoundary label="policy data"><div>POLICY OK</div></ErrorBoundary>);
    expect(clean).toContain("POLICY OK");
    expect(clean).not.toContain("Unable to load");
  });
  it("keying by route resets the lifecycle (simulated by a fresh instance)", () => {
    // Navigating = rendering a new keyed instance; a previous instance's
    // error state must never carry over into the new route's panel.
    const afterNavigation = render(
      <ErrorBoundary key="/policies" label="policy data">
        <div>POLICIES RENDER</div>
      </ErrorBoundary>,
    );
    expect(afterNavigation).toContain("POLICIES RENDER");
    expect(afterNavigation).not.toContain("Retry");
  });
});
