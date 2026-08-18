/**
 * Routes (design.md §5). All five tabs exist: Party (roster + builder + character
 * sheet), Play (the after-game wizard), Camp, Log and the Rules reference.
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
      {
        path: 'play',
        name: 'play',
        component: () => import('./screens/CampaignPhase.vue'),
        props: true,
      },
      {
        path: 'camp',
        name: 'camp',
        component: () => import('./screens/BaseCamp.vue'),
        props: true,
      },
      {
        path: 'adventurer/:advId',
        name: 'character-sheet',
        component: () => import('./screens/CharacterSheet.vue'),
        props: true,
      },
      {
        path: 'log',
        name: 'log',
        component: () => import('./screens/CampaignLog.vue'),
        props: true,
      },
      {
        path: 'rules',
        name: 'rules',
        component: () => import('./screens/RulesReference.vue'),
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
