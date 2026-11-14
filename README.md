# LAHVET — controle de frequência

Aplicativo Node.js/Express com PostgreSQL: login de Admin e Aluno, gestão de membros, reuniões, chamadas, justificativas, frequência e troca de senha mediante confirmação da senha atual.

## Conteúdo deste repositório mínimo

- `api/`, `src/`, `views/` e `public/assets/`: aplicação e entrada da função Vercel.
- `database/migrate.js` e `database/migrations/`: criação/versionamento do banco, executados pelo responsável fora do deploy.
- `certs/supabase-ca.crt`: certificado **público** de autoridade certificadora usado pelo PostgreSQL; não contém chave privada.
- `package.json`, `package-lock.json`, `vercel.json`, `.gitignore`, `.vercelignore` e `.env.example`: dependências e configuração sem segredos.
- `scripts/check-production.js` e `scripts/check-publication.js`: verificações locais.

Testes e documentação detalhada ficam no computador do responsável, conforme a opção de repositório mínimo. Os comandos `test:*` do package.json continuam disponíveis nessa cópia local; não funcionam em um clone que não contenha `tests/`.

## Antes de enviar ao GitHub

Use Node.js 22.x. Rode `npm run check:publish -- --preview` para ver quais arquivos seriam incluídos pelas regras atuais. Com o Git inicializado, rode `npm run check:publish` para revisar também os arquivos rastreados. A busca não imprime valores de segredos e não faz upload. Leia a lista; não use `git add -f` para contornar exclusões.

`.env`, dependências instaladas, logs, backups, documentação detalhada, prints, testes, configurações de ferramentas e chaves privadas devem permanecer fora do repositório. `.env.example` contém somente nomes e exemplos fictícios. Se algum segredo já tiver sido publicado, removê-lo do arquivo atual não apaga o histórico; revogue/rotacione a credencial e revise o histórico antes de tornar o repositório público.

## Execução local

1. Execute `npm ci`.
2. Copie `.env.example` para `.env` e configure os valores exclusivamente na cópia local.
3. Execute `npm run db:migrate` no banco reservado ao projeto.
4. Execute `npm run dev`.

## Configuração na Vercel

Importe o repositório pela raiz do projeto. `vercel.json` usa funções Node com a entrada `api/index.js`, preserva os assets públicos e inclui os HTML de `views` e o certificado no pacote da função. O servidor local continua em `src/server.js`. Não configurar a pasta `public` como site estático independente.

Configure as variáveis em **Settings → Environment Variables**, sem enviar `.env` ao GitHub ou à Vercel:

| Variável | Valor/configuração |
| --- | --- |
| NODE_ENV | production |
| APP_ORIGIN | URL HTTPS exata do site, sem barra final; nunca inferida do Host enviado pelo usuário |
| APP_TIMEZONE | America/Sao_Paulo |
| ADMIN_EMAIL / ADMIN_PASSWORD | Credenciais do Admin, restritas à direção |
| SESSION_SECRET | Segredo aleatório de pelo menos 32 bytes |
| DATABASE_URL | Conexão PostgreSQL do Supabase, com TLS e certificado validado |
| TRUST_PROXY | Deixar vazio na Vercel; o código reconhece o proxy da plataforma usando a variável de sistema VERCEL |

Não criar manualmente `VERCEL=1` no `.env` local. A plataforma fornece essa variável. Em funções, o pool de banco é limitado a uma conexão por instância. Use a conexão apropriada do Supabase para serverless e confira a capacidade do projeto.

Para o certificado incluído, o final da URL de conexão pode usar `?sslmode=verify-full&sslrootcert=./certs/supabase-ca.crt`. Caso já existam parâmetros, acrescente com `&`. Copie host/usuário/porta do painel do provedor e codifique caracteres reservados da senha. Não desative a verificação de certificados.

As variáveis de ambiente da Vercel já são injetadas na função. Não configure `npm start` como Build Command: esse comando é para o servidor local e carrega `.env`. Não execute migrações no build, em cada requisição ou em previews conectados à produção. O deploy instala as dependências pelo lockfile; não há bundle de frontend para gerar.

## Navegação e cadastro

Na página inicial, visitantes veem apenas “Entrar”. Admin e Aluno autenticados veem “Painel de frequência”; somente o Admin autenticado vê também “Cadastro”. O menu é montado no servidor a partir da sessão validada, sem cache compartilhado da página. A opção “Início” foi retirada dessa página.

Cadastro é uma operação administrativa, sem autocadastro público. Criar um aluno mantém a sessão do Admin e não autentica automaticamente o aluno. O acesso direto ao cadastro continua bloqueado para visitantes/alunos. O Aluno acessa somente a própria frequência após fazer login.

## Chamadas e frequência

Na chamada, marque os participantes e use **Salvar chamada**, ao final da lista, para gravar todas as presenças, faltas e justificativas de uma vez. **Fechar chamada**, ao lado, salva as marcações atuais e conclui a chamada; todos precisam estar como Presente ou Falta. Não há salvamento individual por aluno.

Salvar um rascunho mantém a chamada aberta. Apenas reuniões realizadas com chamada fechada entram nos percentuais. Correções posteriores são aplicadas pelo mesmo botão Salvar chamada e mantêm o fechamento. Justificativas não abonam faltas. O painel revalida os dados ao retornar pelo histórico do navegador.

## Troca de senha

No login, “Trocar senha” abre diretamente o formulário. Para salvar, o aluno informa matrícula ou email institucional, senha atual, nova senha e confirmação. A nova senha exige de 8 a 1024 caracteres, uma letra maiúscula e um número ou caractere especial. A troca não faz login automaticamente e invalida as sessões antigas na próxima requisição.

Não há envio de email, dependência do Resend nem recuperação por token. As variáveis RESEND_API_KEY e RESEND_FROM podem ser removidas dos ambientes; não são mais usadas. Se o aluno esquecer a senha, deve procurar a direção; não foi criado um reset administrativo sem confirmação de identidade. O Admin continua alterando suas próprias credenciais pelo ambiente.

A tabela histórica de tokens e suas migrações são preservadas para manter bancos já migrados compatíveis. Links antigos não autorizam uma troca: a nova API sempre exige a senha atual.

## Verificação antes de liberar acesso

A preparação do pacote não equivale a um deploy aprovado. Confira na homologação: cookie Secure, CSRF, login, proteção das páginas, troca com senha atual, TLS do PostgreSQL e funcionamento dos HTML/certificado no pacote. Configure ambientes/bancos separados para Preview e Production.

Os limites por IP de login/troca de senha ainda são locais por instância. Antes de liberar uso público, configurar limitação compartilhada ou proteção equivalente na hospedagem e validar seu efeito. A troca exige credenciais atuais de aluno ativo e invalida as sessões anteriores.

Revisar no Supabase a exposição do schema público à Data API e os privilégios de anon/authenticated; este aplicativo acessa o banco somente pelo servidor. A identidade do responsável, base legal, retenção e aviso de privacidade ainda exigem definição. Nenhum deploy, envio ao GitHub ou alteração de dados reais é realizado por estes arquivos.

Referências: [funções e arquivos incluídos na Vercel](https://vercel.com/docs/project-configuration/vercel-json), [cabeçalhos fornecidos pela Vercel](https://vercel.com/docs/headers/request-headers), [conexões PostgreSQL no Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

### Anexos de justificativas

Atestados podem conter dados pessoais sensíveis. São guardados no Supabase Storage privado, nunca na pasta pública nem no repositório. Apenas o Admin envia/remove; o aluno baixa somente seus próprios documentos após autenticação. Tipos aceitos: PDF, JPG/JPEG e PNG, até 4 MiB por arquivo. A justificativa não abona a falta.

Para habilitar em produção:

1. Execute `npm run db:migrate` para aplicar também `007_attendance_attachments.sql` (não altere migrações anteriores).
2. No Supabase, crie em **Storage** um bucket chamado `justificativas`, com **Public bucket desativado**, limite de 4 MB e tipos `application/pdf`, `image/jpeg`, `image/png`. Não crie políticas públicas de leitura ou escrita.
3. Configure no `.env` local e nas variáveis **Production** da Vercel: `SUPABASE_URL` (URL HTTPS do projeto, sem barra final), `SUPABASE_SERVICE_ROLE_KEY` (chave privada de servidor) e `SUPABASE_ATTACHMENTS_BUCKET=justificativas`. Nunca use prefixos públicos para essa chave nem a envie ao navegador/GitHub. Faça redeploy após salvar.
4. Confira o envio, download do próprio aluno e a recusa de acesso por outra conta, usando documentos fictícios.

O servidor verifica o caráter privado do bucket antes das operações. Downloads passam pelo servidor autenticado e são entregues como arquivo, sem URL pública. Extensão, tipo, assinatura, tamanho e integridade são verificados; isso não é uma varredura antivírus. A função na Vercel recebe bytes diretamente, sem a sobrecarga de base64.

As tabelas de anexos ficam no schema `lahvet_private`, fora da API pública do Supabase, com RLS e sem permissões para PUBLIC. Use uma conexão PostgreSQL de servidor autorizada a esse schema (a conexão de proprietário usada nas migrações já possui acesso). Não exponha esse schema na Data API.

Os arquivos selecionados e as remoções são processados pelo botão **Salvar chamada**, ou ao fechá-la. Se a chamada salvar e um envio falhar, a tela informa os anexos pendentes e preserva a seleção para tentar novamente. Ao mudar uma falta para presença/pendência, o acesso ao anexo é revogado no banco. A remoção física usa uma fila persistente: erros do Storage não desfazem a correção da chamada. Ela é processada em novos salvamentos/remoções; execute também `npm run storage:cleanup` periodicamente e após falhas do provedor para esvaziar a fila. Esse comando remove somente objetos cuja exclusão já foi registrada; não aplica prazo de guarda.

**Prazo de guarda dos atestados: pendente de definição pela liga.** Nenhuma expiração automática foi presumida. A definição e divulgação dessa regra precisam ocorrer antes do uso com documentos reais. Não troque o nome do bucket enquanto houver anexos ou remoções pendentes.

Páginas HTML de erro usam a identidade da LAHVET, mantêm o código HTTP e apresentam caminhos para entrar, voltar ao início ou tentar novamente. APIs continuam respondendo JSON, sem detalhes internos.
