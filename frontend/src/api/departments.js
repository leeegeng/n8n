import request from './request'

export const getDepartments = (params) => {
  return request.get('/departments', { params })
}

export const getDepartment = (id) => {
  return request.get(`/departments/${id}`)
}

export const createDepartment = (data) => {
  return request.post('/departments', data)
}

export const updateDepartment = (id, data) => {
  return request.put(`/departments/${id}`, data)
}

export const deleteDepartment = (id) => {
  return request.delete(`/departments/${id}`)
}

export const getDepartmentUsers = (id) => {
  return request.get(`/departments/${id}/users`)
}
