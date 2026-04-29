const SERVER = 'http://localhost:4000'

async function call(method, path, body) {
  const res = await fetch(`${SERVER}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

export const api = window.electronAPI || {
  dbConnect:      (config)  => call('POST', '/api/connect', config),
  dbInit:         ()        => call('POST', '/api/init'),
  dbSave:         (payload) => call('POST', '/api/save', payload),
  dbListRequests: ()        => call('GET',  '/api/requests'),
  dbGetRows:      ({ requestId, diffOnly }) =>
    call('GET', `/api/rows?requestId=${requestId}&diffOnly=${diffOnly}`),
  getProducts:    ()        => call('GET',  '/api/products'),
  updateRow:      (id, body) => call('PUT',    `/api/rows/${id}`, body),
  deleteRow:      (id)       => call('DELETE', `/api/rows/${id}`),
}