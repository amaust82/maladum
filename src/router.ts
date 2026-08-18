/**
 * Routes (design.md §5). Only the Home picker and the Party tab exist yet; the
 * remaining four tabs land with their phases and are stubbed in `CampaignShell`.
 *
 * Hash history, because the PWA is served as static files and deep links have to
 * survive a hard refresh with no server rewrite rules.
 */

import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'campaigns',
    component: () => import('./screens/CampaignPicker.vue'),
  },
  {
    path: '/c/:campaignId',
    component: () => import('./screens/CampaignShell.vue'),
    props: true,
    children: [
      { path: '', redirect: (to) => `/c/${to.params.campaignId}/party` },
      {
        path: 'party',
        name: 'party',
        component: () => import('./screens/PartyScreen.vue'),
        props: true,
      },
      {
        path: 'party/new',
        name: 'party-new',
        component: () => import('./screens/PartyBuilder.vue'),
        props: true,
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
