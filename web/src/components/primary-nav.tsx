import Link from "next/link";

import { canPerformDroneOpsAction } from "@/lib/auth/actions";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";

import { NavLinks, type NavLink } from "./nav-links";

/**
 * App-wide primary navigation rendered in the root layout. Section links are
 * gated by auth so the bar shows "Sign in" for visitors and the workspace
 * sections (plus Admin when permitted) for signed-in members. Auth resolution
 * is wrapped defensively: a transient auth failure must never take down every
 * page — it degrades to the signed-out bar.
 */
export async function PrimaryNav() {
  let isAuthenticated = false;
  let canAdmin = false;
  try {
    const access = await getDroneOpsAccess();
    isAuthenticated = access.isAuthenticated;
    canAdmin = isAuthenticated && canPerformDroneOpsAction(access, "admin.support");
  } catch {
    // Fall back to the signed-out bar rather than throwing from the layout.
  }

  const links: NavLink[] = [];
  if (isAuthenticated) {
    links.push({ href: "/dashboard", label: "Dashboard" });
    links.push({ href: "/missions", label: "Missions" });
    if (canAdmin) links.push({ href: "/admin", label: "Admin" });
  }

  return (
    <nav className="primary-nav" aria-label="Primary">
      <div className="primary-nav__inner">
        <Link href={isAuthenticated ? "/dashboard" : "/"} className="primary-nav__brand">
          <span className="primary-nav__brand-mark" aria-hidden="true">
            ◆
          </span>
          Aerial Operations OS
        </Link>
        {isAuthenticated ? (
          <NavLinks links={links} />
        ) : (
          <Link href="/sign-in" className="primary-nav__link">
            Sign in
          </Link>
        )}
      </div>
    </nav>
  );
}
