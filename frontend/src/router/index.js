import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/stores/user'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { public: true }
  },
  {
    path: '/',
    name: 'Layout',
    component: () => import('@/layouts/MainLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/index.vue'),
        meta: { title: '首页', icon: 'HomeFilled' }
      },
      {
        path: 'tickets',
        name: 'Tickets',
        component: () => import('@/views/tickets/index.vue'),
        meta: { title: '工单管理', icon: 'Tickets' }
      },
      {
        path: 'tickets/create',
        name: 'CreateTicket',
        component: () => import('@/views/tickets/create.vue'),
        meta: { title: '创建工单', hidden: true }
      },
      {
        path: 'tickets/detail/:id',
        name: 'TicketDetail',
        component: () => import('@/views/tickets/detail.vue'),
        meta: { title: '工单详情', hidden: true }
      },
      {
        path: 'tasks',
        name: 'Tasks',
        component: () => import('@/views/tasks/index.vue'),
        meta: { title: '我的待办', icon: 'BellFilled' }
      },
      {
        path: 'workflows',
        name: 'Workflows',
        component: () => import('@/views/workflows/index.vue'),
        meta: { title: '流程管理', icon: 'Share' }
      },
      {
        path: 'workflows/design/:id?',
        name: 'WorkflowDesign',
        component: () => import('@/views/workflows/design.vue'),
        meta: { title: '流程设计', hidden: true }
      },
      {
        path: 'departments',
        name: 'Departments',
        component: () => import('@/views/departments/index.vue'),
        meta: { title: '部门管理', icon: 'OfficeBuilding' }
      },
      {
        path: 'users',
        name: 'Users',
        component: () => import('@/views/users/index.vue'),
        meta: { title: '用户管理', icon: 'UserFilled' }
      },
      {
        path: 'roles',
        name: 'Roles',
        component: () => import('@/views/roles/index.vue'),
        meta: { title: '角色管理', icon: 'Key' }
      }
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/error/404.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫
router.beforeEach((to, from, next) => {
  const userStore = useUserStore()

  if (to.meta.public) {
    next()
    return
  }

  if (!userStore.token) {
    next('/login')
    return
  }

  next()
})

export default router
