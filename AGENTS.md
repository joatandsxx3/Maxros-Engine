# AGENTS.md — Diretrizes Operacionais e Protocolo de Qualidade do Agente

> **REGRA DE BLOQUEIO (LEITURA OBRIGATÓRIA):**
> Antes de iniciar qualquer nova implementação, refatoração ou correção neste repositório, você **DEVE** ler este arquivo (`/AGENTS.md`) e a documentação viva do projeto (`/DOCUMENTACAO.md`).

---

## 1. Protocolo de Execução Obrigatória

### Passo 1 — Antes de Modificar o Código
1. Ler `/AGENTS.md` e `/DOCUMENTACAO.md` para compreender a arquitetura atual, contratos de classes e sistemas pré-existentes.
2. Verificar se a alteração solicitada afeta algum comportamento já consolidado no núcleo da engine (`src/engine/`) ou no editor visual (`src/App.tsx` e `server.ts`).

### Passo 2 — Durante a Implementação
1. Preservar a separação estrita entre o **Núcleo Puro da Engine** (`src/engine/`, compatível com Node.js headless e Browser), o **Gerenciador de Projetos & Registro de UUIDs** (`src/editor/project-manager/`) e a **Camada de Editor Visual** (`src/App.tsx` e `src/components/ProjectManagerScreen.tsx`).
2. Garantir que objetos auxiliares de visualização do editor (`userData.isViewportHelper`, linhas de seleção, gizmos) **nunca** poluam a serialização `.scene.json` / `.scene` (`EngineNode.serialize()`).
3. Manter a escrita de cenas em disco estritamente atômica via `EditorSceneManager.saveScene()` / `EditorSceneManager.writeAtomicSceneJson()` (`*.tmp.scene.json` / `*.tmp.scene` + `fs.fsyncSync` + `fs.renameSync`) e preservar os sidecars seletivos `.uuid`.
4. Garantir que `project://` aponte **sempre** para a raiz física do projeto atualmente aberto (onde reside `maxros.project.json`) e **nunca** para a raiz de instalação da Maxros Engine.

### Passo 3 — Ao Finalizar Qualquer Tarefa (Validação e Autocorreção)
1. **Rodar Todos os Testes Automatizados:**
   - Executar `npm test` (`node src/engine/validate.js`) para validar todas as 26 baterias de testes (matemática de transformação `local ↔ global`, reparenting, scripts, clonagem de subárvores, tolerância a nós desconhecidos, física, escrita atômica, criação de projetos `maxros.project.json`, raiz dinâmica `project://`, sidecars seletivos `.uuid`, persistência de UUID ao mover/renomear, recuperação de sidecar ausente, resolução controlada de conflitos de UUID duplicado, regeneração de `.maxros/`, migração de projetos legados e ferramentas de visualização de câmera `Camera3DNode` / `CameraHelper`).
   - Executar a verificação de tipos e sintaxe (`npm run lint` / `lint_applet`) e o build de produção (`npm run build` / `compile_applet`).
2. **Correção Imediata de Erros:**
   - Se qualquer teste, lint ou build apresentar falha, **corrija imediatamente** antes de encerrar a resposta.
3. **Proteção de Sistemas Pré-Existentes e Rollback Assistido:**
   - Nunca remova ou degrade silenciosamente funcionalidades ou testes pré-existentes.
   - Se uma nova solicitação entrar em conflito direto com um sistema pré-existente ou fizer um teste anterior falhar de forma incompatível, **pergunte explicitamente ao usuário se deseja desfazer (rollback) a alteração ou adaptar o requisito**, explicando o impacto.
4. **Atualização Obrigatória da Documentação:**
   - Sempre que criar, alterar ou remover funcionalidades, nós, componentes, rotas ou testes, atualize imediatamente `/DOCUMENTACAO.md` (e o resumo em `/AGENTS.md`, se aplicável) no mesmo turno.

---

## 2. Checklist Rápido de Pós-Execução

- [ ] `/AGENTS.md` e `/DOCUMENTACAO.md` foram consultados antes da alteração?
- [ ] `node src/engine/validate.js` (`npm test`) executou com status `PASSED` em todas as baterias?
- [ ] `compile_applet` e `lint_applet` passaram com zero erros?
- [ ] Todos os sistemas pré-existentes continuam íntegros (ou o usuário foi consultado sobre desfazer em caso de conflito)?
- [ ] `/DOCUMENTACAO.md` foi atualizado para refletir o estado exato atual do projeto?
