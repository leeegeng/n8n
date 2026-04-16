import request from './request'

export const getWorkflows = (params) => {
  return request.get('/workflows', { params })
}

export const getWorkflow = (id) => {
  return request.get(`/workflows/${id}`)
}

export const createWorkflow = (data) => {
  return request.post('/workflows', data)
}

export const updateWorkflow = (id, data) => {
  return request.put(`/workflows/${id}`, data)
}

export const deleteWorkflow = (id) => {
  return request.delete(`/workflows/${id}`)
}

export const publishWorkflow = (id) => {
  return request.post(`/workflows/${id}/publish`)
}

export const unpublishWorkflow = (id) => {
  return request.post(`/workflows/${id}/unpublish`)
}

export const cloneWorkflow = (id, data) => {
  return request.post(`/workflows/${id}/clone`, data)
}
