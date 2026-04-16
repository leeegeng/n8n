import request from './request'

export const getRoles = (params) => {
  return request.get('/roles', { params })
}

export const getRole = (id) => {
  return request.get(`/roles/${id}`)
}

export const createRole = (data) => {
  return request.post('/roles', data)
}

export const updateRole = (id, data) => {
  return request.put(`/roles/${id}`, data)
}

export const deleteRole = (id) => {
  return request.delete(`/roles/${id}`)
}

export const getRoleUsers = (id) => {
  return request.get(`/roles/${id}/users`)
}

export const assignRoleUsers = (id, data) => {
  return request.post(`/roles/${id}/users`, data)
}
