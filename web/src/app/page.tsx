import Link from "next/link";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Aerial Operations OS — Nat Ford Planning",
  description:
    "Mission planning, ingest, processing, QA, and delivery for drone mapping programs. Built on OpenDroneMap with a truthful operating posture.",
};

export default function ShowcasePage() {
  return (
    <main className="showcase">
      <header className="showcase__hero">
        <nav className="showcase__nav" aria-label="Primary">
          <Link href="/" className="showcase__brand">
            Aerial Operations OS
          </Link>
          <div className="showcase__nav-links">
            <a href="#how-it-works">How it works</a>
            <a href="#capabilities">Capabilities</a>
            <a href="#pricing">Pricing</a>
            <a href="#truth">What&rsquo;s real today</a>
            <Link href="/sign-in" className="showcase__nav-signin">
              Sign in
            </Link>
          </div>
        </nav>
        <div className="showcase__hero-body">
          <p className="showcase__eyebrow">Nat Ford Planning · ODM+ workflow layer</p>
          <h1>Reliable drone mapping delivery for agencies, consultancies, and operators.</h1>
          <p className="showcase__lede">
            Aerial Operations OS is an OpenDroneMap-based processing workflow with reproducible benchmarks,
            mission-linked evidence, and client-ready deliverables. Built for small cities, counties, tribes,
            RTPAs, and planning firms that need defensible outputs — not generic SaaS theatre.
          </p>
          <div className="showcase__cta-row">
            <Link href="/sign-in" className="showcase__cta showcase__cta--primary">
              Request a pilot
            </Link>
            <a href="#how-it-works" className="showcase__cta showcase__cta--secondary">
              See how it works
            </a>
          </div>
        </div>
      </header>

      <section id="problem" className="showcase__section">
        <h2>From raw imagery to decisions, faster.</h2>
        <div className="showcase__grid showcase__grid--three">
          <article>
            <h3>Inconsistent outputs</h3>
            <p>
              Every contractor produces a different ortho, a different DSM, a different folder layout. We
              standardize on documented ODM presets (fast / balanced / high-quality-3D) and record the exact
              arguments used.
            </p>
          </article>
          <article>
            <h3>Unclear QA</h3>
            <p>
              A managed-processing state machine tracks intake → dispatch → QA → delivery per job. Nothing
              advances a stage without attached evidence — no aspirational status badges.
            </p>
          </article>
          <article>
            <h3>Non-repeatable workflows</h3>
            <p>
              Install bundles export mission geometry + metadata as a portable ZIP for field tools (DJI Fly,
              Pix4D Capture, DroneDeploy, QGIS). Repeat captures land against the same mission spine.
            </p>
          </article>
        </div>
      </section>

      <section id="how-it-works" className="showcase__section showcase__section--alt">
        <h2>How it works</h2>
        <ol className="showcase__steps">
          <li>
            <span className="showcase__step-num">1</span>
            <div>
              <h3>Plan</h3>
              <p>
                Draw AOI polygons on an interactive map. Version mission plans. Export install bundles with
                geometry + manifest for field tools.
              </p>
            </div>
          </li>
          <li>
            <span className="showcase__step-num">2</span>
            <div>
              <h3>Ingest</h3>
              <p>
                Record a truthful v1 ingest session per flight. Attach datasets to the mission with real
                counts, coverage, and timestamps — no placeholder stubs.
              </p>
            </div>
          </li>
          <li>
            <span className="showcase__step-num">3</span>
            <div>
              <h3>Process</h3>
              <p>
                Dispatch to a managed operator via webhook, or run direct against a NodeODM container with
                typed presets. Poll, import outputs, verify before promotion.
              </p>
            </div>
          </li>
          <li>
            <span className="showcase__step-num">4</span>
            <div>
              <h3>Deliver</h3>
              <p>
                Package orthos, DSMs, DTMs, point clouds, and reports as mission-linked artifacts. Share via
                time-bounded signed links with revocation.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section id="capabilities" className="showcase__section">
        <h2>Baseline OSS vs. Aerial Operations OS</h2>
        <div className="showcase__table-wrap">
          <table className="showcase__table">
            <thead>
              <tr>
                <th>Capability</th>
                <th>OpenDroneMap CLI</th>
                <th>WebODM self-host</th>
                <th>Aerial Operations OS</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Photogrammetry engine</td>
                <td>Yes (AGPL)</td>
                <td>Yes (AGPL)</td>
                <td>Yes (AGPL, via NodeODM)</td>
              </tr>
              <tr>
                <td>Mission planning + geometry versioning</td>
                <td>No</td>
                <td>Partial</td>
                <td>Yes</td>
              </tr>
              <tr>
                <td>Managed-processing state machine</td>
                <td>No</td>
                <td>No</td>
                <td>Yes (truthful evidence-gated)</td>
              </tr>
              <tr>
                <td>Reproducible preset presets</td>
                <td>Manual</td>
                <td>Manual</td>
                <td>Documented + selectable</td>
              </tr>
              <tr>
                <td>Multi-tenant org + RBAC</td>
                <td>No</td>
                <td>Single tenant</td>
                <td>Yes (action-matrix)</td>
              </tr>
              <tr>
                <td>Install-bundle export for field tools</td>
                <td>No</td>
                <td>No</td>
                <td>Yes</td>
              </tr>
              <tr>
                <td>Audit trail + event stream per job</td>
                <td>No</td>
                <td>Partial</td>
                <td>Yes</td>
              </tr>
            </tbody>
          </table>
          <p className="showcase__table-note">
            Full matrix in <code>docs/ODM_PLUS_COMPARISON_MATRIX.md</code>.
          </p>
        </div>
      </section>

      <section id="pricing" className="showcase__section showcase__section--alt">
        <h2>Pricing</h2>
        <p className="showcase__lede">
          Project floors reflect the true cost of a defensible deliverable. Hourly rates for support, rework,
          and scope expansion are disclosed in every engagement.
        </p>
        <div className="showcase__grid showcase__grid--three">
          <article className="showcase__pricing-card">
            <h3>Small</h3>
            <p className="showcase__price">$3,500+</p>
            <p>
              Single-site survey, one processing pass, one deliverable bundle. Suitable for targeted
              inspection or a small grant exhibit.
            </p>
          </article>
          <article className="showcase__pricing-card">
            <h3>Medium</h3>
            <p className="showcase__price">$8,500+</p>
            <p>
              Corridor or multi-site program, repeat captures, deliverable set with comparison maps. Fits
              most agency-facing projects.
            </p>
          </article>
          <article className="showcase__pricing-card">
            <h3>Large</h3>
            <p className="showcase__price">$18,000+</p>
            <p>
              Region-wide, longitudinal, or compliance-grade programs. Dedicated processing queue, versioned
              plans, full audit packet.
            </p>
          </article>
        </div>
      </section>

      <section id="truth" className="showcase__section">
        <h2>What&rsquo;s real today</h2>
        <p className="showcase__lede">
          We refuse to pretend state we haven&rsquo;t verified. Here is a candid snapshot.
        </p>
        <div className="showcase__grid showcase__grid--two">
          <article>
            <h3>Shipped</h3>
            <ul>
              <li>Mission / dataset / job / artifact spine with PostGIS geometry.</li>
              <li>Evidence-gated managed-processing state machine.</li>
              <li>Interactive MapLibre planning + coverage visualization.</li>
              <li>NodeODM direct dispatch (optional) + webhook adapter fallback.</li>
              <li>Install-bundle export for field tools.</li>
              <li>Action-matrix RBAC with entitlement gates.</li>
            </ul>
          </article>
          <article>
            <h3>Deferred (roadmap)</h3>
            <ul>
              <li>TiTiler raster delivery backend.</li>
              <li>Public engagement / comment surface.</li>
              <li>Stripe billing + SSO.</li>
              <li>Field companion (offline mobile).</li>
              <li>AI-assisted QA &amp; anomaly review.</li>
            </ul>
          </article>
        </div>
      </section>

      <footer className="showcase__footer">
        <div className="showcase__footer-row">
          <div>
            <strong>Aerial Operations OS</strong>
            <p>A Nat Ford Planning product. Built on OpenDroneMap (AGPL).</p>
          </div>
          <div>
            <p>Covenant: truthful status, fair exchange, protect vulnerable communities, repair quickly.</p>
          </div>
          <div>
            <Link href="/sign-in" className="showcase__cta showcase__cta--primary">
              Request a pilot
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
