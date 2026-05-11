const SERVER = 'http://localhost:4000'

async function call(method, path, body) {
  const token = localStorage.getItem('ae_tool_token')
  const res = await fetch(`${SERVER}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

export const api = window.electronAPI || {
  dbConnect:      (config)   => call('POST', '/api/connect', config),
  dbInit:          ()         => call('POST', '/api/init'),
  dbSave:          (payload)  => call('POST', '/api/save', payload),
  dbListRequests: ()         => call('GET',  '/api/requests'),
  dbGetRows:      ({ requestId, diffOnly }) =>
    call('GET', `/api/rows?requestId=${requestId}&diffOnly=${diffOnly}`),
  updateRow:      (id, body) => call('PUT',    `/api/rows/${id}`, body),
  deleteRow:      (id)       => call('DELETE', `/api/rows/${id}`),

  // 제품 CRUD
  getProducts:      ()         => call('GET',    '/api/products'),
  createProduct:    (body)     => call('POST',   '/api/products', body),
  updateProduct:    (id, body) => call('PUT',    `/api/products/${id}`, body),
  deleteProduct:    (id)       => call('DELETE', `/api/products/${id}`),

  // 국가별 카피 프로젝트 CRUD (CC)
  ccListProjects:   ()         => call('GET',    '/api/cc/projects'),
  ccCreateProject:  (body)     => call('POST',   '/api/cc/projects', body),
  ccUpdateProject:  (id, body) => call('PUT',    `/api/cc/projects/${id}`, body),
  ccDeleteProject:  (id)       => call('DELETE', `/api/cc/projects/${id}`),
  ccGetCopies:      (id)       => call('GET',    `/api/cc/projects/${id}/copies`),
  ccSaveCopies:     (id, body) => call('POST',   `/api/cc/projects/${id}/copies`, body),
  ccUpdateCell:     (body)     => call('PUT',    '/api/cc/copies/cell', body),

  // CopyStatusTracker
  getTrackerPages:     ()         => call('GET',    '/api/tracker/pages'),
  getTrackerDetail:    (id)       => call('GET',    `/api/tracker/pages/${id}`),
  
  updateTrackerStatus: (body)     => call('POST',   '/api/tracker/status', body),
  saveFile:            (payload)  => call('POST',   '/api/files', payload),
  getFiles:            ({ pageId, siteCode }) =>
    call('GET', `/api/files?pageId=${pageId}${siteCode ? `&siteCode=${siteCode}` : ''}`),
  deleteFile:          (id)       => call('DELETE', `/api/files/${id}`),
  updateHistoryNote:   (id, body) => call('PUT',    `/api/files/${id}/note`, body),
  createTrackerPage:   (body)     => call('POST',   '/api/tracker/pages', body),

  
 // ── Merge 프로젝트 ──────────────────────────────────────────
  mergeListProjects:      ()                     => call('GET',    '/api/merge/projects'),
  mergeCreateProject:     (body)                 => call('POST',   '/api/merge/projects', body),
  mergeUpdateProject:     (id, body)             => call('PUT',    `/api/merge/projects/${id}`, body),
  mergeDeleteProject:     (id)                   => call('DELETE', `/api/merge/projects/${id}`),
  mergeGetProject:        (id)                   => call('GET',    `/api/merge/projects/${id}`),

  // 국가별 카피 (프로젝트 내)
  mergeUpsertCountry:     (projectId, body)      => call('POST',   `/api/merge/projects/${projectId}/countries`, body),
  mergeDeleteCountry:     (projectId, countryId) => call('DELETE', `/api/merge/projects/${projectId}/countries/${countryId}`),
  mergeGetCountryHistory: (projectId, countryId) => call('GET',    `/api/merge/projects/${projectId}/countries/${countryId}/history`),
}