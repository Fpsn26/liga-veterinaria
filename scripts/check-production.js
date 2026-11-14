import { checkProductionEnvironment } from '../src/config/production.js';

const checks = await checkProductionEnvironment(process.env);
console.log('Verificação local de configuração; nenhum valor de ambiente será exibido.');
for (const { name, ok } of checks) console.log(`${ok ? 'OK' : 'PENDENTE'} — ${name}`);
console.log('Não verifica DNS, certificado do site/banco, permissões SQL, entrega do Resend ou aprovação de privacidade. Consulte README.md.');
process.exitCode = checks.every(check => check.ok) ? 0 : 1;
