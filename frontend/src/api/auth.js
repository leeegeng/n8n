import request from './request'

export const login = (data) => {
  return request.post('/auth/login', data)
}

export const getProfile = () => {
  return request.get('/auth/profile')
}

export const updatePassword = (data) => {
  return request.put('/auth/password', data)
}
