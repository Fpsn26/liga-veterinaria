import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { X509Certificate } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const preview = process.argv.includes('--preview');
let temporary;
try {
  let prefix = [];
  if (preview) {
    // Avalia as regras atuais sem criar/modificar .git neste projeto.
    temporary = await mkdtemp(join(tmpdir(), 'lahvet-publication-'));
    execFileSync('git', ['init', '-q', temporary], { stdio: 'pipe' });
    prefix = [`--git-dir=${join(temporary, '.git')}`, `--work-tree=${root}`];
  }
  const files = execFileSync('git', [...prefix, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\0').filter(Boolean);
  const staged = new Set(execFileSync('git', [...prefix, 'ls-files', '--cached', '-z'],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\0').filter(Boolean));
  const values = ['ADMIN_PASSWORD', 'SESSION_SECRET', 'RESEND_API_KEY', 'DATABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
    .map(key => process.env[key]).filter(value => value && value.length >= 6);
  try {
    const password = decodeURIComponent(new URL(process.env.DATABASE_URL).password);
    if (password.length >= 6) values.push(password);
  } catch { /* Ambiente ausente não impede a busca por padrões conhecidos. */ }
  const findings = [];
  for (const file of [...new Set(files)].sort()) {
    const path = join(root, file);
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) { findings.push({ file, issue: 'link simbólico: revisar destino' }); continue; }
    if (/(^|\/)(?:\.env(?:\..*)?|node_modules|docs|tests|\.aws|\.agents|\.codex|\.vercel)(?:\/|$)/.test(file) && file !== '.env.example') {
      findings.push({ file, issue: 'arquivo local ou sensível incluído' });
    }
    const versions = [{ buffer: await readFile(path), source: 'arquivo' }];
    if (staged.has(file)) versions.push({ buffer: execFileSync('git', [...prefix, 'show', `:${file}`],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }), source: 'índice Git' });
    for (const { buffer, source } of versions) {
      const content = buffer.toString('utf8');
      if (values.some(value => buffer.includes(Buffer.from(value)))) findings.push({ file, issue: `valor de segredo do ambiente encontrado (${source})` });
      if (/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(content)) findings.push({ file, issue: `chave privada encontrada (${source})` });
      if (/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16}|re_[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{20,})\b/.test(content)) {
        findings.push({ file, issue: `possível token de serviço encontrado (${source})` });
      }
      if (file !== '.env.example' && /postgres(?:ql)?:\/\/[^\s:"']+:[^\s@"']+@/i.test(content)) {
        findings.push({ file, issue: `conexão com credenciais embutidas encontrada (${source})` });
      }
    }
  }
  const required = ['package.json', 'package-lock.json', 'vercel.json', 'api/index.js', 'src/app.js',
    'views/pages/login.html', 'views/pages/trocar-senha.html', 'certs/supabase-ca.crt'];
  for (const file of required) if (!files.includes(file)) findings.push({ file, issue: 'arquivo necessário ausente do conjunto selecionado' });
  try {
    const pem = await readFile(join(root, 'certs/supabase-ca.crt'), 'utf8');
    const certificate = new X509Certificate(pem);
    if (!certificate.ca || new Date(certificate.validTo) <= new Date()) throw Error('invalid');
    if (/PRIVATE KEY/.test(pem)) throw Error('invalid');
  } catch { findings.push({ file: 'certs/supabase-ca.crt', issue: 'certificado CA inválido, expirado ou com chave privada' }); }
  console.log(preview ? 'PRÉVIA: regras avaliadas em Git temporário; índice e histórico reais não foram verificados.' : 'Arquivos do índice e não rastreados avaliados; histórico de commits não foi examinado.');
  console.log(`Arquivos selecionados: ${new Set(files).size}`);
  for (const file of [...new Set(files)].sort()) console.log(`INCLUIR ${file}`);
  for (const { file, issue } of findings) console.log(`REVISAR ${file}: ${issue}`);
  console.log(findings.length ? `Resultado: ${findings.length} pendência(s).` : 'Resultado: nenhum segredo reconhecido ou arquivo proibido encontrado no conjunto selecionado.');
  console.log('Esta busca não substitui revisão de dados pessoais, imagens, segredos desconhecidos e histórico. Não executa upload ou deploy.');
  process.exitCode = findings.length ? 1 : 0;
} catch {
  console.error('Verificação indisponível. Confirme o Git e os arquivos; use --preview para avaliar regras sem repositório inicializado.');
  process.exitCode = 1;
} finally { if (temporary) await rm(temporary, { recursive: true, force: true }); }
