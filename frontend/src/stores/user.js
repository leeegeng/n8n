import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login, getProfile } from '@/api/auth'

export const useUserStore = defineStore('user', () => {
  // State
  const token = ref(localStorage.getItem('token') || '')
  const userInfo = ref(null)

  // Getters
  const isLoggedIn = computed(() => !!token.value)
  const userId = computed(() => userInfo.value?.id)
  const username = computed(() => userInfo.value?.username)
  const realName = computed(() => userInfo.value?.realName)
  const avatar = computed(() => userInfo.value?.avatar)
  const roles = computed(() => userInfo.value?.roles || [])
  const isAdmin = computed(() => roles.value.some(r => r.code === 'admin'))

  // Actions
  const setToken = (newToken) => {
    token.value = newToken
    localStorage.setItem('token', newToken)
  }

  const clearToken = () => {
    token.value = ''
    userInfo.value = null
    localStorage.removeItem('token')
  }

  const loginAction = async (credentials) => {
    const res = await login(credentials)
    setToken(res.token)
    userInfo.value = res.user
    return res
  }

  const fetchUserInfo = async () => {
    try {
      const res = await getProfile()
      userInfo.value = res
      return res
    } catch (error) {
      clearToken()
      throw error
    }
  }

  const logout = () => {
    clearToken()
  }

  return {
    token,
    userInfo,
    isLoggedIn,
    userId,
    username,
    realName,
    avatar,
    roles,
    isAdmin,
    setToken,
    clearToken,
    loginAction,
    fetchUserInfo,
    logout
  }
})
