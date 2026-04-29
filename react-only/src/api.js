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
  updateRow:      (id, body) => call('PUT',    `/api/rows/${id}`, body),
  deleteRow:      (id)       => call('DELETE', `/api/rows/${id}`),
  // 제품 CRUD
  getProducts:      ()        => call('GET',    '/api/products'),
  createProduct:    (body)    => call('POST',   '/api/products', body),
  updateProduct:    (id, body) => call('PUT',   `/api/products/${id}`, body),
  deleteProduct:    (id)      => call('DELETE', `/api/products/${id}`),
}