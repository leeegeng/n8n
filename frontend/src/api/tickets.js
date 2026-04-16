import request from './request'

export const getTickets = (params) => {
  return request.get('/tickets', { params })
}

export const getTicket = (id) => {
  return request.get(`/tickets/${id}`)
}

export const createTicket = (data) => {
  return request.post('/tickets', data)
}

export const approveTicket = (id, data) => {
  return request.post(`/tickets/${id}/approve`, data)
}

export const countersignTicket = (id, data) => {
  return request.post(`/tickets/${id}/countersign`, data)
}

export const transferTask = (id, data) => {
  return request.post(`/tickets/${id}/transfer`, data)
}

export const cancelTicket = (id, data) => {
  return request.post(`/tickets/${id}/cancel`, data)
}

export const getTodoTasks = () => {
  return request.get('/tickets/tasks/todo')
}

export const getMyTickets = (params) => {
  return request.get('/tickets/my/created', { params })
}
