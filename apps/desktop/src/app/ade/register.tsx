/**
 * Register the ADE console as a first-class CORE page: a `/ade` workspace page
 * (routes area) + a Sessions-sidebar nav row (sidebar.nav area). Uses the same
 * contribution registry every core surface and bundle plugin uses, so the page
 * renders in the workspace pane like Capabilities/Artifacts — not an overlay,
 * not a plugin sandbox.
 *
 * ID DISCIPLINE (load-bearing): a runtime desktop plugin already ships an ADE
 * page, and the registry is keyed by (area, id). Its `ctx.register` namespaces
 * ids to `${pluginId}:${id}` = `ade:page` / `ade:nav` — exactly what a naive
 * core id would be, so the plugin (loaded later, async) OVERWRITES the core
 * contributions in place (observed: core route vanished from the registry at
 * +4s). The core ids are therefore `ade-console:*`. With distinct ids both
 * routes exist for `/ade`; the core route sorts first (`order: -1000`) so React
 * Router keeps it, and a `sidebarNav.prefs` contribution hides the legacy
 * plugin's nav row so only one ADE row shows. Nothing in the plugin or config
 * is touched.
 */
import type { ReactNode } from 'react'

import { registry } from '@/contrib/registry'
import {
  ROUTES_AREA,
  type RouteContribution,
  SIDEBAR_NAV_AREA,
  type SidebarNavContribution
} from '@/app/routes'
import { SIDEBAR_NAV_PREFS_AREA, type SidebarNavPrefsContribution } from '@/store/sidebar-nav'

import { AdePage } from './index'

export const ADE_ROUTE = '/ade'
export const ADE_NAV_LABEL = 'ADE 控制台'
/** The legacy runtime plugin's scoped nav id, hidden in favour of this page. */
const LEGACY_PLUGIN_NAV_ID = 'ade:nav'

/** Idempotent: re-registering the same ids replaces them in place. */
export function registerAdeConsole(): () => void {
  return registry.registerMany([
    {
      area: ROUTES_AREA,
      id: 'ade-console:page',
      source: 'core',
      // Sorts FIRST so the core page wins the `/ade` path over the legacy
      // runtime plugin's own `/ade` route (React Router keeps the first
      // same-path entry). The plugin stays registered, untouched.
      order: -1000,
      data: { path: ADE_ROUTE } satisfies RouteContribution,
      render: (): ReactNode => <AdePage />
    },
    {
      area: SIDEBAR_NAV_AREA,
      id: 'ade-console:nav',
      source: 'core',
      // Below the built-in top rows; near the other secondary pages.
      order: 45,
      data: { codicon: 'list-tree', label: ADE_NAV_LABEL, path: ADE_ROUTE } satisfies SidebarNavContribution
    },
    {
      // Hide the legacy plugin's ADE row so the sidebar shows ONE ADE entry.
      area: SIDEBAR_NAV_PREFS_AREA,
      id: 'ade-console:prefs',
      source: 'core',
      data: { hide: [LEGACY_PLUGIN_NAV_ID] } satisfies SidebarNavPrefsContribution
    }
  ])
}