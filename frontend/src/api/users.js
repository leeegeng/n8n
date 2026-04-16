import request from './request'

export const getUsers = (params) => {
  return request.get('/users', { params })
}

export const getUser = (id) => {
  return request.get(`/users/${id}`)
}

export const createUser = (data) => {
  return request.post('/users', data)
}

export const updateUser = (id, data) => {
  return request.put(`/users/${id}`, data)
}

export const deleteUser = (id) => {
  return request.delete(`/users/${id}`)
}

export const resetPassword = (id, data) => {
  return request.put(`/users/${id}/reset-password`, data)
}

export const getUserSelectList = (params) => {
  return request.get('/users/select/list', { params })
}
