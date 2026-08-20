// ── DB 환경 로컬 레지스트리 ────────────────────────────────────
// 각 DB 환경(host/port/user/password/database)마다 users 테이블이 독립적으로
// 존재하기 때문에, "어느 DB 환경들이 등록돼 있고 어떤 계정이 접근 가능한지"는
// 특정 DB 안에 저장할 수 없다 (어느 DB에도 연결 안 된 상태에서도 봐야 하므로).
// 그래서 서버가 실제로 설치된 폴더의 로컬 JSON 파일로 관리한다.
const fs = require('fs');
const path = require('path');
const { getDataDir } = require('./paths');

function registryPath() {
  return path.join(getDataDir(), 'db-environments.json');
}

function readRegistry() {
  const p = registryPath();
  if (!fs.existsSync(p)) return { environments: [] };
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.environments)) return { environments: [] };
    return parsed;
  } catch (_) {
    return { environments: [] };
  }
}

function writeRegistry(data) {
  const p = registryPath();
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

/** 등록된 DB 환경 전체 목록 (비밀번호는 마스킹해서 반환하는 건 호출부 책임) */
function listEnvironments() {
  return readRegistry().environments;
}

function findEnvironment(id) {
  return readRegistry().environments.find(e => e.id === id) || null;
}

/** 새 DB 환경 등록. config: { label, host, port, user, password, database } */
function addEnvironment(config) {
  const data = readRegistry();
  const env = {
    id: `env_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    label:    config.label,
    host:     config.host,
    port:     Number(config.port) || 3306,
    user:     config.user,
    password: config.password,
    database: config.database,
    createdAt: new Date().toISOString(),
    grantedEmails: [], // 이 환경에 접근 권한을 부여받은 이메일 목록
  };
  data.environments.push(env);
  writeRegistry(data);
  return env;
}

function removeEnvironment(id) {
  const data = readRegistry();
  data.environments = data.environments.filter(e => e.id !== id);
  writeRegistry(data);
}

/** 특정 환경에 이메일 접근 권한 기록 추가 (실제 계정 생성은 admin.js에서 별도 수행) */
function grantAccess(envId, email) {
  const data = readRegistry();
  const env = data.environments.find(e => e.id === envId);
  if (!env) throw new Error('등록되지 않은 DB 환경입니다.');
  const normalized = email.trim().toLowerCase();
  if (!env.grantedEmails.includes(normalized)) {
    env.grantedEmails.push(normalized);
  }
  writeRegistry(data);
  return env;
}

function revokeAccess(envId, email) {
  const data = readRegistry();
  const env = data.environments.find(e => e.id === envId);
  if (!env) throw new Error('등록되지 않은 DB 환경입니다.');
  const normalized = email.trim().toLowerCase();
  env.grantedEmails = env.grantedEmails.filter(e => e !== normalized);
  writeRegistry(data);
  return env;
}

/** 특정 이메일이 접근 가능한 환경 목록 (label만, 비밀번호 제외) */
function environmentsForEmail(email) {
  const normalized = email.trim().toLowerCase();
  return listEnvironments()
    .filter(e => e.grantedEmails.includes(normalized))
    .map(e => ({ id: e.id, label: e.label, host: e.host, database: e.database }));
}

module.exports = {
  listEnvironments,
  findEnvironment,
  addEnvironment,
  removeEnvironment,
  grantAccess,
  revokeAccess,
  environmentsForEmail,
};