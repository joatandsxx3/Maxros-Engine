# DOCUMENTACAO.md — Enciclopédia Arquitetural e Manual Completo da Maxros Engine

> **Documento Oficial e Completo da Maxros Engine**
> Este documento descreve **absolutamente tudo** o que compõe a **Maxros Engine**, desde a sua concepção original e reestruturação de identidade até o funcionamento interno de cada arquivo, cada nó (`Node`), cada classe nativa, o motor de scripts JavaScript nativos, o motor físico 3D (`cannon-es`), o sistema de projetos e identificação por UUID (`maxros.project.json` + sidecars `.uuid`), as ferramentas de câmera do Viewport 3D e as 26 baterias de validação automatizada.

---

## Sumário

1. [Da Concepção à Maxros Engine Atual (História e Filosofia de Engenharia)](#1-da-concepção-à-maxros-engine-atual-história-e-filosofia-de-engenharia)
2. [Árvore Completa de Arquivos do Projeto (File Tree Comentada)](#2-árvore-completa-de-arquivos-do-projeto-file-tree-comentada)
3. [Arquitetura Geral em Camadas](#3-arquitetura-geral-em-camadas)
4. [Gerenciamento de Projetos, Raiz Dinâmica (`project://`) e Sistema Seletivo de UUIDs](#4-gerenciamento-de-projetos-raiz-dinâmica-project-e-sistema-seletivo-de-uuids)
5. [Referência Completa Nó por Nó (Todos os 32 Nós da Engine)](#5-referência-completa-nó-por-nó-todos-os-32-nós-da-engine)
   - 5.1. [`EngineNode` / `Node` / `Node3D` (A Base de Tudo)](#51-enginenode--node--node3d-a-base-de-tudo)
   - 5.2. [`SceneTree` (A Árvore de Execução Ativa)](#52-scenetree-a-árvore-de-execução-ativa)
   - 5.3. [`Camera3D` / `Camera3DNode` (Câmera 3D, Ícone, Linhas de Direção, Frustum e Preview)](#53-camera3d--camera3dnode-câmera-3d-ícone-linhas-de-direção-frustum-e-preview)
   - 5.4. [`Light3D` e Subclasses (`DirectionalLight3D`, `PointLight3D`, `SpotLight3D`, `AmbientLight3D`, `HemisphereLight3D`)](#54-light3d-e-subclasses-directionallight3d-pointlight3d-spotlight3d-ambientlight3d-hemispherelight3d)
   - 5.5. [`Mesh3D` (Malhas Geométricas 3D — 9 Primitivas Nativas)](#55-mesh3d-malhas-geométricas-3d--9-primitivas-nativas)
   - 5.6. [`Sprite3DNode` / `Sprite3D` (Sprites 3D Billboard, Planos e Texturas Procedurais Dual-Env)](#56-sprite3dnode--sprite3d-sprites-3d-billboard-planos-e-texturas-procedurais-dual-env)
   - 5.7. [`Label3D` (Texto Espacial 3D)](#57-label3d-texto-espacial-3d)
   - 5.8. [`Particles3D` (Sistema de Partículas 3D)](#58-particles3d-sistema-de-partículas-3d)
   - 5.9. [`Path3D` e `PathFollow3D` (Caminhos e Trilhas 3D Interpoladas)](#59-path3d-e-pathfollow3d-caminhos-e-trilhas-3d-interpoladas)
   - 5.10. [`PickArea3D` (Área Espacial de Clique e Ponteiro 3D)](#510-pickarea3d-área-espacial-de-clique-e-ponteiro-3d)
   - 5.11. [`RigidBody3DNode` / `RigidBody3D` (Corpo Físico 3D e Ponte `Three.js ↔ cannon-es`)](#511-rigidbody3dnode--rigidbody3d-corpo-físico-3d-e-ponte-threejs--cannon-es)
   - 5.12. [`CollisionShape3DNode` / `CollisionShape3D` (Formas de Colisão `Box` e `Sphere`)](#512-collisionshape3dnode--collisionshape3d-formas-de-colisão-box-e-sphere)
   - 5.13. [`Timer` (Temporizador de Cena)](#513-timer-temporizador-de-cena)
   - 5.14. [`AudioPlayer` (Reprodutor de Áudio 2D/3D Espacial)](#514-audioplayer-reprodutor-de-áudio-2d3d-espacial)
   - 5.15. [`AnimationPlayer` (Animação por Quadros-Chave / Keyframes)](#515-animationplayer-animação-por-quadros-chave--keyframes)
   - 5.16. [`UILayer` e Hierarquia `Control` (Interface 2D e HUD Ancorado ao 3D)](#516-uilayer-e-hierarquia-control-interface-2d-e-hud-ancorado-ao-3d)
6. [Sistema de Scripts Nativos e Componentes Modulares (Como Tudo Funciona por Dentro)](#6-sistema-de-scripts-nativos-e-componentes-modulares-como-tudo-funciona-por-dentro)
7. [Classes Nativas, Serviços Globais, Recursos e Códigos de Erro (`E101`–`E501`)](#7-classes-nativas-serviços-globais-recursos-e-códigos-de-erro-e101e501)
8. [Serialização Atômica, `NodeFactory` e Resiliência contra Corrupção](#8-serialização-atômica-nodefactory-e-resiliência-contra-corrupção)
9. [Editor Visual 3D, Ferramentas de Câmera do Viewport, Gizmos e Picture-in-Picture](#9-editor-visual-3d-ferramentas-de-câmera-do-viewport-gizmos-e-picture-in-picture)
10. [Jogo Demonstrativo Oficial: *Guardião Geométrico: Arena dos Cristais*](#10-jogo-demonstrativo-oficial-guardião-geométrico-arena-dos-cristais)
11. [As 26 Baterias de Testes Automatizados (`src/engine/validate.js`)](#11-as-26-baterias-de-testes-automatizados-srcenginevalidatejs)
12. [Integração de Skills e Superpowers (`obra/superpowers`)](#12-integração-de-skills-e-superpowers-obrasuperpowers)

---

## 1. Da Concepção à Maxros Engine Atual (História e Filosofia de Engenharia)

### 1.1. A Ideia Original e os Desafios Resolvidos
A **Maxros Engine** nasceu com o objetivo de ser uma engine de jogos 3D e 2D completa, visual e programável na Web e em Node.js, unindo:
1. **Arquitetura de Árvore de Nós (inspirada na filosofia Godot Engine):** onde cada elemento do jogo é um nó (`Node` / `Node3D` / `Control`) que pode ser composto livremente em hierarquias pai-filho, emitir sinais (`Signal`), pertencer a grupos, possuir scripts JavaScript nativos (`.script.js`) e ser serializado em JSON legível por humanos (`.scene.json`).
2. **Matemática 3D e Física Real Sem Conflitos de Espaço:** um dos problemas clássicos ao unir um grafo de cena hierárquico (`Three.js`, onde filhos herdam a matriz de transformação do pai) com um motor de física (`cannon-es`, onde corpos rígidos vivem sempre no espaço global absoluto) é a **dupla transformação** quando um corpo físico é filho de um nó rotacionado ou escalado. A Maxros Engine resolve isso matematicamente na raiz:
   - `EngineNode` expõe `position` (local) e `position_global` (global), convertendo automaticamente coordenadas globais para o espaço local do pai via inversão matricial (`invParentWorld = parent.matrixWorld.clone().invert()`).
   - `RigidBody3DNode` sincroniza `CANNON.Body ↔ Three.js` compensando qualquer rotação/escala de nós pais, e reconstrói automaticamente formas compostas a partir de seus filhos `CollisionShape3DNode`.
3. **Execução Dual-Environment (100% compatível com Node.js Headless e Browser WebGL):**
   - Todo o núcleo da engine (`src/engine/`) roda **sem depender de DOM ou contexto WebGL** quando executado em Node.js (`npm test`), permitindo validar toda a matemática, física, scripts, animações, sinais, escrita atômica e gerenciamento de projetos em milissegundos no terminal.
4. **Reestruturação para Maxros Engine, Isolamento de Projetos e Identidade por UUID:**
   - O projeto evoluiu de *CoreStudio / Core3D Studio* para **Maxros Engine**, introduzindo um **Gerenciador de Projetos completo**, manifestos `maxros.project.json`, resolução dinâmica de caminhos via `project://` (apontando sempre para a pasta física do projeto ativo), distribuição isolada e reproduzível do runtime em `core/` (com `package.json` e `package-lock.json` travados) e identificação seletiva de recursos por **sidecars `.uuid`** com detecção não silenciosa de conflitos.

---

## 2. Árvore Completa de Arquivos do Projeto (File Tree Comentada)

Abaixo está a árvore real completa de diretórios e arquivos do repositório e a explicação do papel de cada arquivo:

```text
/ (Raiz do Repositório da Maxros Engine)
├── AGENTS.md                                   # Protocolo operacional obrigatório e checklist de qualidade do agente
├── DOCUMENTACAO.md                             # Esta enciclopédia completa da arquitetura, nós, scripts e sistemas
├── package.json                                # Scripts npm (dev, build, start, lint, test) e dependências (three, cannon-es, react, express, vite)
├── tsconfig.json                               # Configuração TypeScript para o Editor Visual e Servidor
├── vite.config.ts                              # Configuração do bundler Vite (React + Tailwind CSS)
├── index.html                                  # Ponto de entrada HTML da Maxros Engine
├── metadata.json                               # Metadados da aplicação no AI Studio
├── .env.example                                # Exemplo de variáveis de ambiente
├── server.ts                                   # Servidor Full-Stack Express + APIs REST (/api/projects/*, /api/scene/*, /api/engine/validate) + Vite Middleware
│
├── .maxros-engine/                             # Metadados globais da instalação da Maxros Engine
│   └── recent_projects.json                    # Histórico persistente de Projetos Recentes do usuário (exclui demos oficiais)
│
├── scenes/                                     # Cenas padrão de fallback do servidor
│   └── default_level.scene                     # Cena física padrão gerada atomicamente como fallback inicial
│
├── projects/                                   # Diretório onde residem os projetos criados e a Demo Oficial
│   ├── guardiao-geometrico-demo/               # Projeto Demonstrativo Oficial ("Guardião Geométrico: Arena dos Cristais", type: "demo")
│   │   ├── maxros.project.json                 # Manifesto JSON do projeto Demo (UUID, main_scene por UUID, folders, engine_version)
│   │   ├── .maxros/                            # Dados técnicos internos descartáveis/regeneráveis do projeto
│   │   │   └── metadata/
│   │   │       └── uuid_registry.json          # Cache/histórico de mapeamento UUID <-> caminho relativo para recuperação de sidecars
│   │   ├── core/                               # Runtime independente e reproduzível copiado para dentro do projeto
│   │   │   ├── version.json                    # Manifesto de versão e lista de arquivos do runtime distribuído
│   │   │   ├── engine/                         # Módulos do núcleo da engine necessários em runtime
│   │   │   │   ├── index.js
│   │   │   │   ├── EngineNode.js
│   │   │   │   ├── SceneNodes.js
│   │   │   │   ├── SceneTree.js
│   │   │   │   ├── RigidBody3DNode.js
│   │   │   │   ├── CollisionShape3DNode.js
│   │   │   │   ├── Sprite3DNode.js
│   │   │   │   ├── PhysicsServer.js
│   │   │   │   └── NodeFactory.js
│   │   │   ├── native/
│   │   │   │   └── NativeClasses.js            # Classes nativas e serviços globais do runtime
│   │   │   └── runtime/
│   │   │       ├── runtime.js                  # Inicializador standalone do runtime do projeto
│   │   │       ├── package.json                # Dependências exatas do runtime (three, cannon-es)
│   │   │       └── package-lock.json           # Lockfile v3 reproduzível para execução fora do editor
│   │   ├── scenes/
│   │   │   ├── main.scene.json                 # Cena completa serializada do jogo Guardião Geométrico
│   │   │   └── main.scene.json.uuid            # Sidecar UUID exclusivo da cena principal
│   │   ├── scripts/
│   │   │   ├── player_controller.script.js     # Script nativo controlador do jogador e da arena
│   │   │   └── player_controller.script.js.uuid# Sidecar UUID exclusivo do script
│   │   └── resources/
│   │       ├── default_floor.material.json     # Recurso de material JSON do piso da arena
│   │       ├── default_floor.material.json.uuid# Sidecar UUID do material
│   │       ├── default.input.json              # Mapa de ações de entrada (WASD, Setas, Espaço)
│   │       └── default.input.json.uuid         # Sidecar UUID do mapa de entrada
│   │
│   └── meu-jogo-3d/                            # Exemplo de projeto de usuário ("Meu Jogo 3D", type: "user")
│       ├── maxros.project.json                 # Manifesto JSON do projeto do usuário
│       ├── .maxros/                            # Cache, imports, thumbnails, metadata/uuid_registry.json, editor/last_session.json
│       ├── core/                               # Cópia isolada do runtime da engine + package-lock.json
│       ├── assets/textures/                    # Pasta de texturas e modelos 3D do projeto
│       ├── scenes/
│       │   ├── main.scene.json                 # Cena 3D padrão inicial (MainCamera, DirectionalLight, GroundFloor, StarterCube)
│       │   └── main.scene.json.uuid            # Sidecar UUID da cena
│       ├── scripts/
│       │   ├── main.script.js                  # Script inicial com hooks onReady(node) e onProcess(dt, node)
│       │   └── main.script.js.uuid             # Sidecar UUID do script
│       └── resources/
│           ├── default_floor.material.json     # Material inicial do projeto (+ .uuid)
│           └── default.input.json              # Configuração de inputs do projeto (+ .uuid)
│
├── src/                                        # Código-fonte principal da Maxros Engine e do Editor
│   ├── main.tsx                                # Bootstrap React 19 montando <App />
│   ├── index.css                               # Estilos globais Tailwind CSS (@import "tailwindcss";)
│   ├── App.tsx                                 # Editor Visual 3D completo (Árvore de Nós, Viewport Three.js, Ferramentas de Câmera, Gizmos, Inspetor, Preview PiP, Simulação Física e Assets)
│   │
│   ├── components/
│   │   └── ProjectManagerScreen.tsx            # Tela / Modal do Gerenciador de Projetos (Meus Projetos, Recentes, Demos, Criar Projeto com 3 Templates, Abrir maxros.project.json)
│   │
│   ├── editor/
│   │   └── project-manager/                    # Subsistema de Gerenciamento de Projetos, Caminhos Virtuais e Registro de UUIDs
│   │       ├── index.js                        # Ponto de exportação unificado do gerenciador de projetos
│   │       ├── ProjectManager.js               # Coordenador central de criação, abertura, listagem e contexto ativo do projeto
│   │       ├── ProjectCreator.js               # Provisionador transacional de novos projetos (3 templates + cópia enxuta de core/ + lockfile)
│   │       ├── ProjectLoader.js                # Carregador de projetos existentes, regeneração de .maxros/, resolução de main_scene por UUID e migração legada
│   │       ├── ProjectValidator.js             # Validador estrutural de maxros.project.json, pastas obrigatórias e detecção de formato legado
│   │       ├── ProjectPathResolver.js          # Resolvedor dinâmico de esquemas virtuais (project://, engine://, user://) com proteção contra path traversal
│   │       ├── ResourceUUIDRegistry.js         # Gerenciador seletivo de sidecars .uuid, rastreamento de mover/renomear, recuperação de sidecar ausente e resolução de conflitos duplicados
│   │       └── RecentProjects.js               # Persistência e higienização da lista de Projetos Recentes do usuário
│   │
│   └── engine/                                 # NÚCLEO PURO DA MAXROS ENGINE (Node.js Headless + Browser WebGL)
│       ├── index.js                            # Exportador público de todos os nós, classes nativas, física, serialização e helpers
│       ├── validate.js                         # Suíte de Validação Automatizada com as 26 Baterias de Testes (executada via `npm test`)
│       │
│       ├── core/
│       │   ├── NativeClasses.js                # Classes nativas e serviços: Log (E101-E501), Signal, Easing, Tween, Rng, Shake, StateMachine, Save, Input, Material, ImageTexture, Canvas2D, CanvasTexture, Curve3D, AnimationClip, Theme, DataResource, ResourceRegistry, Audio, Playlist
│       │   └── SceneTree.js                    # Gerenciador da árvore de execução ativa, grupos, timers, serviços e troca de cenas
│       │
│       ├── nodes/
│       │   ├── EngineNode.js                   # Classe base fundamental (EngineNode / Node / Node3D): transformações local/global, hierarquia, %UniqueName, sinais, grupos, scripts, tweens e serialização
│       │   ├── SceneNodes.js                   # Todos os nós de cena 3D, Tempo, Áudio, Animação e UI 2D (Camera3D/Camera3DNode, Light3D + 5 luzes, Mesh3D, Label3D, Particles3D, Path3D, PathFollow3D, PickArea3D, Timer, AudioPlayer, AnimationPlayer, UILayer, Control + 12 controles UI)
│       │   ├── RigidBody3DNode.js              # Nó de corpo rígido 3D (dynamic, kinematic, static) integrado ao cannon-es
│       │   ├── CollisionShape3DNode.js         # Nó de forma de colisão 3D (Box, Sphere) com suporte a múltiplos colisores compostos
│       │   └── Sprite3DNode.js                 # Nó visual de Sprite 3D (billboard ou plano 3D) com texturas procedurais compatíveis com Node.js e Browser
│       │
│       ├── physics/
│       │   └── PhysicsServer.js                # Servidor de física 3D (CANNON.World, SAPBroadphase, timeScale, deduplicação por UUID)
│       │
│       ├── serialization/
│       │   ├── NodeFactory.js                  # Fábrica de reconstrução recursiva de cenas (.scene.json / .scene), clonagem de subárvores com novos UUIDs e tolerância a nós desconhecidos
│       │   └── EditorSceneManager.js           # Gerenciador de salvamento atômico em disco (.tmp.scene.json -> fsyncSync -> renameSync) e preservação de sidecar .uuid
│       │
│       ├── helpers/
│       │   └── EditorGuides.js                 # Guias visuais do Editor (grade 3D, eixos X/Y/Z, contorno de seleção, linhas pai-filho, chassi/ícone/linhas de direção -Z da Camera3D, THREE.CameraHelper frustum e presets da Câmera do Editor)
│       │
│       └── demos/
│           └── GeometricMiniGame.js            # Construtor completo da cena e scripts do mini-game demonstrativo "Guardião Geométrico: Arena dos Cristais"
│
└── superpowers/                                # Repositório oficial obra/superpowers clonado e instalado na raiz do projeto
```

---

## 3. Arquitetura Geral em Camadas

A Maxros Engine respeita uma separação estrita em **4 camadas independentes**:

1. **Camada 1 — Núcleo Puro da Engine (`src/engine/`):**
   - Implementado em ES Modules JavaScript puro (`Three.js` + `cannon-es`).
   - Não possui nenhuma dependência de React ou de APIs exclusivas do navegador.
   - Roda identicamente em **Node.js Headless** (para testes automatizados, servidores dedicados ou CLI) e no **Browser** (para renderização WebGL).
2. **Camada 2 — Gerenciador de Projetos, Resolvedor `project://` e Registro de UUIDs (`src/editor/project-manager/`):**
   - Gerencia o ciclo de vida físico dos projetos em disco (`maxros.project.json`, `.maxros/`, `core/`, `scenes/`, `scripts/`, `assets/`, `resources/`).
   - Garante que cada recurso elegível possua um identificador único universal (`.uuid`) que sobrevive a renomeações e movimentações de pastas.
3. **Camada 3 — Servidor de Persistência e APIs (`server.ts`):**
   - Expõe endpoints REST (`/api/projects/*`, `/api/scene/*`, `/api/engine/validate`) que operam atomicamente sobre o sistema de arquivos real.
4. **Camada 4 — Editor Visual 3D e Project Manager UI (`src/App.tsx` e `src/components/ProjectManagerScreen.tsx`):**
   - Interface gráfica construída em React + Tailwind CSS + Three.js WebGLRenderer, oferecendo edição em tempo real da Árvore de Nós, Gizmos de Transformação, Ferramentas de Câmera (`Perspectiva`/`Ortográfica`, `ViewCube` 3D, `THREE.CameraHelper` Frustum e `Camera Preview` Picture-in-Picture), Inspetor de Propriedades e execução ao vivo (`Play`, `Pause`, `+1 Frame`, `Stop & Reset`).

---

## 4. Gerenciamento de Projetos, Raiz Dinâmica (`project://`) e Sistema Seletivo de UUIDs

### 4.1. Manifesto `maxros.project.json`
Todo projeto da Maxros Engine é identificado pelo arquivo `maxros.project.json` na sua raiz física:
```json
{
  "uuid": "5485b92a-229c-4919-8385-531c09e0411b",
  "engine": "Maxros Engine",
  "engine_version": "1.0.0",
  "project_version": 1,
  "name": "Meu Jogo 3D",
  "type": "user",
  "main_scene": {
    "uuid": "c49f8a12-7e30-4b11-9a21-029384716253"
  },
  "folders": {
    "core": "core",
    "scenes": "scenes",
    "assets": "assets",
    "scripts": "scripts",
    "resources": "resources",
    "build": "build"
  },
  "trust_policy": {
    "trusted": true,
    "origin": "local_user"
  }
}
```
- **Por que `main_scene` usa `{ "uuid": "..." }` em vez de um caminho fixo?**
  Porque se o desenvolvedor renomear `scenes/main.scene.json` para `scenes/levels/fase_01.scene.json`, o `ResourceUUIDRegistry` localiza instantaneamente o arquivo pelo seu UUID e o projeto continua abrindo sem quebrar!

### 4.2. Raiz Dinâmica (`project://`) em `ProjectPathResolver.js`
- **`project://`**: resolve **sempre** para o diretório físico onde está o `maxros.project.json` do projeto ativo no momento.
  - Exemplo: se o projeto aberto está em `/app/applet/projects/meu-jogo-3d`, então `project://scenes/main.scene.json` resolve para `/app/applet/projects/meu-jogo-3d/scenes/main.scene.json`.
  - Se o usuário alternar para `/app/applet/projects/outro-jogo`, `project://` passa imediatamente a apontar para `/app/applet/projects/outro-jogo`.
  - **Segurança contra Path Traversal:** qualquer tentativa de resolver `project://../../etc/passwd` lança um erro de segurança bloqueando o acesso fora da raiz do projeto.
- **`engine://`**: aponta para os recursos internos da engine (`src/engine/`).
- **`user://`**: aponta para os dados persistentes do jogador dentro do projeto ativo (`.maxros/user_data/`).

### 4.3. Regra Seletiva de Sidecars `.uuid` (`ResourceUUIDRegistry.js`)
Para evitar poluir pastas técnicas com identificadores desnecessários, a Maxros Engine aplica uma regra seletiva estrita:
- **Recebem arquivo sidecar `<nome_do_arquivo>.uuid`:**
  - Cenas (`.scene.json`)
  - Scripts (`.script.js`)
  - Materiais (`.material.json`)
  - Mapas de entrada (`.input.json`)
  - Modelos 3D (`.gltf`, `.glb`, `.obj`, `.fbx`)
  - Texturas e imagens (`.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`, `.hdr`)
  - Áudios (`.mp3`, `.wav`, `.ogg`, `.flac`)
  - Fontes e dados (`.ttf`, `.otf`, `.woff`, `.woff2`, `.json` em `assets/` ou `resources/`)
- **NÃO recebem sidecar `.uuid`:**
  - `maxros.project.json` (já possui seu próprio campo `"uuid"` interno).
  - Arquivos técnicos de `core/` (runtime da engine).
  - Arquivos descartáveis de `.maxros/` (`cache`, `imports`, `thumbnails`, `metadata`, `editor`).
  - Os próprios arquivos `.uuid`.

### 4.4. Recuperação de Sidecar Ausente e Resolução Não Silenciosa de Conflito de UUID Duplicado
1. **Recuperação de `.uuid` ausente:** se um arquivo `.scene.json` ou `.script.js` perder acidentalmente seu arquivo `.uuid`, o `ResourceUUIDRegistry` consulta primeiro o histórico em `.maxros/metadata/uuid_registry.json` e as referências existentes nas cenas do projeto. Se encontrar o UUID original daquele caminho, restaura o mesmo UUID sem quebrar referências; caso contrário, informa o usuário para gerar um novo sidecar.
2. **Conflito de UUID Duplicado (Sem Correção Silenciosa):** se o usuário copiar manualmente um arquivo junto com seu `.uuid`, gerando dois arquivos diferentes com o mesmo UUID, a engine **não** sobrescreve silenciosamente nenhum deles. Ela detecta a colisão, analisa qual arquivo é o proprietário original no histórico e exibe um alerta explícito no Editor permitindo escolher qual arquivo mantém o UUID original e qual recebe um novo UUID (`resolveDuplicateConflict`).

---

## 5. Referência Completa Nó por Nó (Todos os 32 Nós da Engine)

Abaixo está a explicação detalhada de **cada um dos 32 tipos de nós** existentes na Maxros Engine, suas propriedades, métodos, sinais e como funcionam internamente.

---

### 5.1. `EngineNode` / `Node` / `Node3D` (A Base de Tudo)
**Arquivo:** `src/engine/nodes/EngineNode.js`
**Herança:** `THREE.Object3D` → `EngineNode` → `Node` → `Node3D`

`EngineNode` é a classe fundamental da qual todos os outros nós herdam. `Node` e `Node3D` são subclasses diretas que preservam 100% da mesma API para compatibilidade tanto com nós lógicos (`Timer`, `AnimationPlayer`, `UILayer`) quanto espaciais 3D.

#### Como funciona a Matemática de Transformação (`Local ↔ Global`):
- **`node.position` (`{ x, y, z }`):** representa a posição **local** em relação ao nó pai. Ao atribuir `node.position = { x: 1, y: 2, z: 3 }`, o setter atualiza `_rawPosition`, recompõe a matriz local (`updateMatrix()`), propaga a matriz mundial (`updateMatrixWorld(true)`), aciona `_onTransformChanged()` (atualizando corpos físicos filhos) e emite o sinal `'transformChanged'`.
- **`node.position_global` / `node.globalPosition` (`{ x, y, z }`):**
  - **Leitura (`get`):** atualiza a cadeia de matrizes dos ancestrais (`updateWorldMatrix(true, false)`) e extrai a posição exata no mundo via `getWorldPosition()`.
  - **Escrita (`set`):** se o nó possui um pai, calcula a matriz inversa do pai (`_invParentMatrix.copy(this.parent.matrixWorld).invert()`), multiplica a coordenada global desejada por essa matriz inversa (`_localPos.applyMatrix4(_invParentMatrix)`) e salva o resultado em `_rawPosition`. Isso garante precisão matemática absoluta mesmo quando o pai está rotacionado em 3 eixos e escalado!
- **`node.quaternion_global` / `node.globalQuaternion`:** lê ou define a rotação global em quaternion, multiplicando pelo inverso do quaternion global do pai quando aninhado.
- **`node.scale_global`:** retorna a escala global acumulada no mundo.
- **`node.getRotationDegrees()` / `node.setRotationDegrees({ x, y, z })`:** converte entre radianos (usados internamente pelo Three.js) e graus Euler para exibição amigável no Inspetor e em scripts.
- **`node.translate(vetor, espaco = 'local' | 'global')`:** desloca o nó nos seus próprios eixos locais (aplicando `this.quaternion`) ou nos eixos globais do mundo.
- **`node.rotate(eixo, anguloEmGraus, espaco = 'local' | 'global')`:** rotaciona em torno de um vetor arbitrário normalizado.
- **`node.toGlobal(pontoLocal)` e `node.toLocal(pontoGlobal)`:** converte qualquer coordenada 3D entre o espaço local do nó e o espaço global da cena.

#### Hierarquia, Reparenting sem Salto Visual e Busca de Nós:
- **`add(child)` / `addChild(child)`:** adiciona um filho verificando antes:
  1. **Prevenção de Ciclo (`E102`):** impede adicionar um nó dentro dele mesmo ou de um descendente seu.
  2. **Unicidade de `%Nome` (`E103`):** se `child.uniqueName === true`, verifica se já existe outro nó com o mesmo nome único na cena.
  3. Propaga a entrada na `SceneTree` (`enteredTree` → `ready`) e emite `'childAdded'`.
- **`reparentPreservingWorldTransform(newParent)` / `reparent(novoPai, true)`:**
  - Captura a `matrixWorld` atual do nó antes de removê-lo do pai antigo.
  - Calcula a nova matriz local em relação ao novo pai: `newLocalMatrix = inv(newParent.matrixWorld) * oldWorldMatrix`.
  - Decompõe `newLocalMatrix` em `position`, `quaternion` e `scale`, anexando o nó ao novo pai **sem que ele dê nenhum salto visual, giro ou mudança de tamanho no Viewport 3D**.
- **`getNodeOrNull(caminho)` / `getNode(caminho)` / `hasNode(caminho)`:**
  - Suporta caminhos absolutos (`/MainSceneRoot/Player`), caminhos relativos (`../Inimigo`, `./Arma`) e **Nomes Únicos na Cena (`%PlayerCore`, `%HudPontuacao`)** em tempo constante/recursivo independente da profundidade na árvore.
  - Se `getNode(caminho)` não encontrar o nó, registra automaticamente o erro estruturado **`E101`** no `Log`.
- **`findChild(padrao, recursivo = true)`:** busca filhos usando curingas (`*` e `?`, ex.: `findChild('Crystal_*')`).
- **`findChildren({ name, type, group }, recursivo = true)`:** filtra múltiplos descendentes combinando padrão de nome, tipo de classe (`type: 'Mesh3D'`) e grupo (`group: 'collectibles'`).
- **`getPath()`:** retorna o caminho completo desde a raiz (ex.: `"/ArenaRoot/Enemies/Turret_1"`).

#### Sinais Embutidos e Customizados (`Signals`):
Cada `EngineNode` já nasce com 9 sinais nativos pré-declarados:
`ready`, `enteredTree`, `exitingTree`, `childAdded`, `childRemoved`, `renamed`, `destroyed`, `transformChanged`, `visibilityChanged`.
- **`defineSignal(nome)`:** declara um novo sinal customizado no nó (ex.: `this.defineSignal('vidaMudou')`).
- **`connect(sinal, fn, alvo)` / `disconnect(sinal, fn, alvo)`:** inscreve ou remove ouvintes.
- **`emit(sinal, ...args)`:** dispara todos os ouvintes conectados.
- **`waitFor(sinal)`:** retorna uma `Promise` que resolve na próxima emissão do sinal (ideal para código assíncrono `await node.waitFor('timeout')`).

#### Grupos, Tempo, Tweens e Ciclo de Vida:
- **`addToGroup(grupo)` / `removeFromGroup(grupo)` / `isInGroup(grupo)`:** classifica nós em tags lógicas (`"enemies"`, `"crystals"`, `"destructibles"`).
- **`wait(segundos)`:** aguarda `N` segundos sincronizado com o tempo da `SceneTree`.
- **`every(segundos, fn)`:** agenda uma função periódica atrelada ao ciclo de vida do nó (cancelada automaticamente se o nó for destruído ou via `.cancel()`).
- **`createTween()`:** cria um `Tween` vinculado ao nó (que para automaticamente se o nó for destruído).
- **`shake(config)`:** aplica um tremor procedural (`Shake`) que restaura a posição original ao terminar.
- **`destroy()`:** destrói recursivamente os filhos, executa o hook `onDestroy()` dos scripts, remove corpos físicos do `PhysicsServer`, limpa intervalos e emite `'destroyed'`.

---

### 5.2. `SceneTree` (A Árvore de Execução Ativa)
**Arquivo:** `src/engine/core/SceneTree.js`

A `SceneTree` orquestra a execução em tempo real de toda a cena:
- **Propriedades:** `root`, `currentScene`, `currentCamera`, `paused`, `timeScale` (`0.25x`, `1x`, `2x`), `time` (tempo acumulado em segundos), `frame` (contador de quadros), `isPlaying`, `nodeCount`.
- **Sinais da Árvore:** `sceneChanged`, `pausedChanged`, `nodeAdded`, `nodeRemoved`.
- **Operações em Grupo (Batch Operations):**
  - `getNodesInGroup(grupo)`: retorna todos os nós ativos que pertencem ao grupo.
  - `callGroup(grupo, metodo, ...args)`: invoca um método em todos os nós (ou em seus scripts) daquele grupo de uma só vez.
  - `setGroupProperty(grupo, propriedade, valor)`: altera uma propriedade em todos os membros do grupo.
  - `emitGroup(grupo, sinal, ...args)`: emite um sinal em todos os membros do grupo.
- **Gerenciamento de Cenas:**
  - `instantiate(cenaJson)`: reconstrói uma subárvore via `NodeFactory.deserialize()`.
  - `changeScene(novaCenaOuJson)`: desmonta a cena atual disparando `exitingTree`, monta a nova cena disparando `enteredTree` e `ready` (em pós-ordem: filhos ficam prontos antes do pai) e emite `sceneChanged`.
  - `reloadScene()`: restaura a cena a partir do snapshot inicial salvo.
- **Respeito a `processMode` e `processPriority` no `step(dt)`:**
  - A cada frame, a `SceneTree` coleta os nós respeitando se a árvore está pausada (`inherit`, `pausable`, `whenPaused`, `always`, `disabled`), ordena-os por `processPriority` crescente e executa `_stepNodeInternal(scaledDt)` em cada um.

---

### 5.3. `Camera3D` / `Camera3DNode` (Câmera 3D, Ícone, Linhas de Direção, Frustum e Preview)
**Arquivo:** `src/engine/nodes/SceneNodes.js` & `src/engine/helpers/EditorGuides.js`
**Herança:** `EngineNode` → `Node` → `Node3D` → `Camera3D` (também exportado como `Camera3DNode`)

Representa uma câmera posicionável na árvore de cena (câmera do jogo/cena, distinta da Câmera de Navegação do Editor).
- **Propriedades:**
  - `current` (`boolean`): define se esta é a câmera principal ativa da cena.
  - `projection` (`'perspective'` | `'orthographic'`): alterna entre `THREE.PerspectiveCamera` e `THREE.OrthographicCamera`.
  - `fov` (`number`, padrão `60`): campo de visão vertical em graus (modo perspectiva).
  - `aspect` (`number`, padrão `1.7778` / `16:9`): proporção largura/altura do frustum.
  - `size` (`number`, padrão `10`): altura ortográfica em metros (modo ortográfico).
  - `near` (`number`, padrão `0.1`) e `far` (`number`, padrão `1000`): planos de corte próximo e distante.
  - `threeCamera`: instância interna `THREE.PerspectiveCamera` ou `THREE.OrthographicCamera` sincronizada com a posição e rotação globais do nó.
- **Métodos Nativos:**
  - `makeCurrent()`: torna esta câmera a ativa da cena e desmarca automaticamente `current` nas demais `Camera3D` da árvore.
  - `worldToScreen(ponto3D, viewport)`: projeta uma coordenada 3D `{ x, y, z }` para pixels 2D `{ x, y, ndcZ }` na tela.
  - `screenToRay(ponto2D, viewport)`: converte um clique 2D na tela em um raio 3D `{ origin, direction }`.
  - `screenToWorld(ponto2D, profundidade, viewport)`: projeta um ponto 2D da tela para uma coordenada 3D a uma distância específica da lente.
- **Representação Visual no Viewport do Editor (`EditorGuides.js`):**
  1. **Chassi 3D, Lente, Bobinas, Ícone Flutuante e Linhas de Direção (`createCameraNodeVisualHelper`):** todo `Camera3D` exibe no Viewport 3D seu corpo de câmera, barril da lente apontando para `-Z`, bobinas superiores, um *billboard sprite* com o ícone de câmera e **linhas de direção integradas** (raio contínuo e tracejado ao longo do eixo óptico `-Z`, ponta de seta cônica indicando exatamente para que lado a câmera aponta, quadro near-frame e triângulo indicador `UP` no eixo `+Y`).
  2. **Frustum Amarelo (`THREE.CameraHelper` via `createCameraFrustumHelper` / `syncCameraFrustumHelper`):** quando a câmera é selecionada, o Editor exibe o tronco de pirâmide amarelo mostrando o alcance exato de `FOV`, `Aspect`, `Near` e `Far`, atualizando-o em tempo real (`helper.update()`) ao mexer nos controles do Inspetor.
  3. **Preview Picture-in-Picture em Tempo Real:** no Inspetor Direito, a aba **"Camera Preview"** renderiza a visão ao vivo dessa câmera reutilizando o mesmo `THREE.WebGLRenderer` (`setViewport` + `setScissor`).

---

### 5.4. `Light3D` e Subclasses (`DirectionalLight3D`, `PointLight3D`, `SpotLight3D`, `AmbientLight3D`, `HemisphereLight3D`)
**Arquivo:** `src/engine/nodes/SceneNodes.js`
**Herança:** `Node3D` → `Light3D` → Subclasses específicas

Nós de iluminação 3D que encapsulam as luzes nativas do Three.js (marcadas internamente com `userData.isViewportHelper = true` para que o objeto `THREE.Light` ilumine a cena sem duplicar nós na serialização JSON):
- **`DirectionalLight3D`**: luz solar paralela (`color`, `intensity`, `castShadow`, `shadowMapSize`, `shadowBias`).
- **`PointLight3D`**: luz omnidirecional pontual (`color`, `intensity`, `range`, `decay`).
- **`SpotLight3D`**: holofote cônico (`color`, `intensity`, `range`, `angle` em graus, `penumbra`, `decay`).
- **`AmbientLight3D`**: iluminação global uniforme (`color`, `intensity`).
- **`HemisphereLight3D`**: luz atmosférica céu/chão (`color` do céu, `groundColor` do solo, `intensity`).

---

### 5.5. `Mesh3D` (Malhas Geométricas 3D — 9 Primitivas Nativas)
**Arquivo:** `src/engine/nodes/SceneNodes.js`
**Herança:** `Node3D` → `Mesh3D`

Nó visual 3D para construção de cenários, personagens estilizados, itens colecionáveis e protótipos sem depender de arquivos externos:
- **9 Formas Geométricas Suportadas (`shape`):**
  1. `'box'` (`THREE.BoxGeometry`: `width`, `height`, `depth`)
  2. `'sphere'` (`THREE.SphereGeometry`: `radius`, `widthSegments`, `heightSegments`)
  3. `'cylinder'` (`THREE.CylinderGeometry`: `radiusTop`, `radiusBottom`, `height`, `radialSegments`)
  4. `'cone'` (`THREE.ConeGeometry`: `radius`, `height`, `radialSegments`)
  5. `'torus'` (`THREE.TorusGeometry`: `radius`, `tube`, `radialSegments`, `tubularSegments`)
  6. `'torusKnot'` (`THREE.TorusKnotGeometry`: `radius`, `tube`, `tubularSegments`, `radialSegments`)
  7. `'plane'` (`THREE.PlaneGeometry`: `width`, `height`)
  8. `'octahedron'` (`THREE.OctahedronGeometry`: `radius`, `detail` — usado nos cristais de energia!)
  9. `'icosahedron'` (`THREE.IcosahedronGeometry`: `radius`, `detail` — usado no núcleo do jogador!)
- **Propriedades e Materiais:**
  - `color` (hexadecimal `#rrggbb`), `wireframe` (`boolean`), `castShadow`, `receiveShadow`, `pickable`.
  - `material`: instância da classe nativa `Material` (`standard` PBR com `roughness`/`metalness`/`emissive`, `phong` ou `unlit`).

---

### 5.6. `Sprite3DNode` / `Sprite3D` (Sprites 3D Billboard, Planos e Texturas Procedurais Dual-Env)
**Arquivo:** `src/engine/nodes/Sprite3DNode.js`
**Herança:** `EngineNode` → `Sprite3DNode` (alias `Sprite3D`)

Exibe imagens 2D e decalques dentro do espaço 3D:
- **Modos de Renderização (`renderMode`):**
  - `'sprite'`: utiliza `THREE.Sprite` (billboard que olha sempre para a câmera).
  - `'plane'`: utiliza `THREE.Mesh` com `THREE.PlaneGeometry` e `THREE.DoubleSide` (malha 3D plana que rotaciona livremente em 3D, ideal para decalques em caixotes e placas).
- **Gerador Determinístico de Texturas (`createProceduralFallbackTexture`):**
  - No Browser, desenha padrões ricos em `<canvas>` (`hazard_stripes`, `cargo_crate`, `steel_plate`, `neon_orb`).
  - No Node.js Headless (onde não há `document` nem `HTMLImageElement`), gera uma `THREE.DataTexture` RGBA determinística em memória RAM baseada no hash do caminho da textura, garantindo que `setTexture()` funcione 100% igual nos testes automatizados e no navegador.

---

### 5.7. `Label3D` (Texto Espacial 3D)
**Arquivo:** `src/engine/nodes/SceneNodes.js`
**Herança:** `Node3D` → `Label3D`

Texto flutuante posicionado no espaço 3D para placas, indicadores de dano ou nomes sobre objetos:
- **Propriedades:** `text`, `font`, `fontSize`, `color`, `outlineColor`, `outlineSize`, `align` (`'left'` | `'center'` | `'right'`), `maxWidth`, `billboard` (`'spherical'` | `'cylindrical'` | `'none'`), `opacity`.

---

### 5.8. `Particles3D` (Sistema de Partículas 3D)
**Arquivo:** `src/engine/nodes/SceneNodes.js`
**Herança:** `Node3D` → `Particles3D`

Emissor leve de partículas 3D renderizado com `THREE.Points` e `BufferGeometry` dinâmico:
- **Propriedades:** `emitting`, `oneShot`, `amount`, `lifetime`, `explosiveness`, `spawnShape`, `shapeSize`, `direction`, `spread`, `speedMin`, `speedMax`, `gravity`, `damping`, `sizeStart`, `sizeEnd`, `colorOverLife`, `opacityOverLife`, `blending`.
- **Métodos:** `restart()`, `emitBurst(quantidade)`, `stop()`, `clear()`.
- **Sinal:** emite `'finished'` quando configurado com `oneShot: true` e todas as partículas encerram seu tempo de vida.

---

### 5.9. `Path3D` e `PathFollow3D` (Caminhos e Trilhas 3D Interpoladas)
**Arquivo:** `src/engine/nodes/SceneNodes.js`
**Herança:** `Node3D` → `Path3D` e `Node3D` → `PathFollow3D`

- **`Path3D`**: armazena uma curva 3D (`Curve3D`) composta por uma sequência de pontos `{ x, y, z }` no espaço.
- **`PathFollow3D`**: quando adicionado como filho de um `Path3D`, move-se automaticamente ao longo da curva do pai!
  - `progress` (`0.0` a `1.0`): posição normalizada ao longo do caminho. Alterar `progress` recalcula instantaneamente `this.position` interpolando a curva do pai (`parent.curve.sample(progress)`).
  - `speed`: avança `progress += speed * dt` automaticamente a cada frame.
  - `loop`: se `true`, dá a volta continuamente (`progress % 1`).
  - `rotateAlongPath`: se `true`, calcula a tangente da curva (`parent.curve.sampleTangent(progress)`) e orienta automaticamente a rotação Y (`yaw`) do nó na direção do movimento (usado pelas sentinelas patrulheiras no Guardião Geométrico!).

---

### 5.10. `PickArea3D` (Área Espacial de Clique e Ponteiro 3D)
**Arquivo:** `src/engine/nodes/SceneNodes.js`
**Herança:** `Node3D` → `PickArea3D`

Define uma região interativa clicável no espaço 3D:
- **Propriedades:** `shape` (`'sphere'` | `'box'`), `size` (`{ x, y, z, radius }`), `enabled`, `pickPriority`, `cursor`.
- **Sinais:** `pointerEnter`, `pointerExit`, `pointerDown`, `pointerUp`, `clicked`.
- **Método:** `triggerClick(evento)` dispara a sequência `pointerDown` → `pointerUp` → `clicked` se `enabled === true`.

---

### 5.11. `RigidBody3DNode` / `RigidBody3D` (Corpo Físico 3D e Ponte `Three.js ↔ cannon-es`)
**Arquivo:** `src/engine/nodes/RigidBody3DNode.js`
**Herança:** `EngineNode` → `RigidBody3DNode` (alias `RigidBody3D`)

Integra um `CANNON.Body` real à árvore de nós 3D:
- **Tipos de Corpo (`bodyType`):**
  - `'dynamic'` (`CANNON.Body.DYNAMIC`): sofre ação da gravidade (`-9.82 m/s²`), forças, impulsos e colisões.
  - `'static'` (`CANNON.Body.STATIC`, massa `0`): imóvel (pisos, paredes, rampas).
  - `'kinematic'` (`CANNON.Body.KINEMATIC`, massa `0`): movido por scripts ou componentes (como rotores mecânicos), empurrando corpos dinâmicos no caminho.
- **Sincronização Bidirecional Inteligente:**
  1. **Editor / Script → Física (`syncTransformToBody()`):** sempre que você move ou gira o nó no Editor (ou muda `position` / `position_global` por script), o `RigidBody3DNode` lê sua posição e quaternion globais (`this.position_global` e `this.quaternion_global`) e atualiza imediatamente o `CANNON.Body`.
  2. **Física → Visual (`syncBodyToTransform()`):** a cada passo da simulação física (`update(dt)`), copia a pose calculada pelo `cannon-es` de volta para o nó Three.js. Se o `RigidBody3DNode` for filho de um nó pai transformado, multiplica pela matriz inversa do pai (`_invParentMatrix`) para evitar dupla transformação.
- **Composição de Colisores (`rebuildShapesFromChildren()`):** varre todos os filhos `CollisionShape3DNode` e monta automaticamente colisores simples ou compostos (`body.addShape(shape, offset, orientation)`).

---

### 5.12. `CollisionShape3DNode` / `CollisionShape3D` (Colisão Independente: `Box`, `Sphere`, `Cylinder` e `Trimesh / MeshCollider`)
**Arquivo:** `src/engine/nodes/CollisionShape3DNode.js`
**Herança:** `EngineNode` → `CollisionShape3DNode` (alias `CollisionShape3D`)

A colisão na Maxros Engine é **separada da Física** (a Física funciona como Script/Componente `PhysicsScript`, enquanto a Colisão é o nó dedicado `CollisionShape3D`). No painel direito (**Propriedades**), é possível selecionar entre **4 tipos de colisão (`shapeType`)**:
- **`'Box'` (`BoxShape3D` — Caixa 3D):** `CANNON.Box` com `dimensions: { x, y, z }` (`halfExtents`).
- **`'Sphere'` (`SphereShape3D` — Esfera 3D):** `CANNON.Sphere` com `radius`.
- **`'Cylinder'` (`CylinderShape3D` — Cilindro 3D):** `CANNON.Cylinder` com `radius` e `height`.
- **`'Trimesh'` (`TrimeshShape3D` / `MeshCollider` — Colisão desenhada com o Desenho do Modelo 3D):**
  - Chamado tecnicamente de **`Trimesh`** (ou **`MeshCollider`**), este modo constrói um `CANNON.Trimesh` real e desenha no Viewport 3D uma malha aramada (`THREE.WireframeGeometry`) que **copia exatamente os vértices, arestas e triângulos do modelo 3D (`Mesh3D`)** pai ou irmão (`trimeshSourceShape: 'auto'`), ou de qualquer geometria 3D escolhida (`octahedron`, `icosahedron`, `torus`, `torusKnot`, `cone`, `cylinder`, `sphere`, `box`).
  - Quando você cria um `CollisionShape3D` dentro de um `Mesh3D` (ou clica no botão **"+ Adicionar CollisionShape3D (Trimesh do Modelo 3D)"** dentro das propriedades do `Mesh3D`), ele já nasce configurado como `Trimesh` seguindo o desenho exato daquele modelo 3D, e se atualiza automaticamente caso você mude a forma do `Mesh3D`!
- **Escala Herdada Automática:** `createCannonShape()` leva em conta tanto a escala local do `CollisionShape3DNode` quanto a escala do nó pai, garantindo que escalar um objeto com o gizmo `R` no Editor redimensione também o seu colisor!

---

### 5.13. `Timer` (Temporizador de Cena)
**Arquivo:** `src/engine/nodes/SceneNodes.js`
**Herança:** `Node` → `Timer`

Nó dedicado à contagem de tempo dentro da árvore:
- **Propriedades:** `waitTime` (segundos), `oneShot` (`true` dispara uma única vez; `false` repete continuamente), `autostart` (inicia automaticamente no `_onReadyInternal`), `paused`, `timeLeft`.
- **Métodos:** `start(tempoOpcional)`, `stop()`.
- **Sinal:** emite `'timeout'` sempre que `timeLeft` atinge `0`.

---

### 5.14. `AudioPlayer` (Reprodutor de Áudio 2D/3D Espacial)
**Arquivo:** `src/engine/nodes/SceneNodes.js`
**Herança:** `Node3D` → `AudioPlayer`

Nó de reprodução sonora integrado aos barramentos do serviço `Audio` (`master`, `music`, `sfx`, `ui`):
- **Propriedades:** `src`, `bus`, `volume`, `pitch`, `loop`, `autoplay`, `spatial` (áudio 3D posicional), `refDistance`, `maxDistance`, `rolloffFactor`, `playing`.
- **Métodos:** `play()`, `stop()`, `pause()`, `resume()`, `seek(segundos)`, `fadeIn(duracao)`, `fadeOut(duracao)`.
- **Sinal:** `finished`.

---

### 5.15. `AnimationPlayer` (Animação por Quadros-Chave / Keyframes)
**Arquivo:** `src/engine/nodes/SceneNodes.js`
**Herança:** `Node` → `AnimationPlayer`

Motor completo de animação por linhas do tempo (`AnimationClip`):
- **Tipos de Trilhas (`tracks`) suportadas em cada clipe:**
  1. **Trilha de Propriedade (`position`, `rotationDegrees`, `scale`, ou qualquer atributo numérico/vetorial):** interpola suavemente entre keyframes `{ time, value, easing }` usando qualquer uma das 21 curvas do `Easing`.
  2. **Trilha de Evento (`type: 'event'`):** dispara o sinal `animationPlayer.emit('event', nomeDoEvento, dados)` no instante exato em que o playhead cruza o tempo do keyframe.
  3. **Trilha de Chamada de Método (`type: 'call'`):** invoca diretamente um método `{ time, method, args }` no nó-alvo quando o playhead cruza o keyframe.
- **Métodos:** `addClip(clip)`, `removeClip(nome)`, `play(nome, opcoes)`, `stop()`, `pause()`, `resume()`, `seek(segundos)`, `queue(nomeProximoClipe)`.
- **Sinais:** `started`, `finished`, `looped`, `event`.

---

### 5.16. `UILayer` e Hierarquia `Control` (Interface 2D e HUD Ancorado ao 3D)
**Arquivo:** `src/engine/nodes/SceneNodes.js`

A Maxros Engine possui um sistema completo de nós de interface 2D serializados na mesma árvore da cena:
- **`UILayer`**: camada raiz 2D (`layer`, `scaleMode: 'scaleWithScreen'`, `referenceResolution: { width: 1280, height: 720 }`, `visible`).
- **`Control`**: classe base de todos os widgets 2D:
  - Possui `anchor` (`topLeft`, `topRight`, `bottomLeft`, `bottomRight`, `center`), `offset`, `uiPosition`, `size`, `opacity`, `disabled`, `tooltip`, `style`.
  - **Ancoragem 3D → 2D (`control.anchorTo3D(no3DOuCaminho, offsetTela)`):** permite vincular qualquer `Label` ou `Panel` 2D a um objeto 3D da cena (ex.: `tagJogador.anchorTo3D('%PlayerCore', { x: 0, y: -38 })`). A cada frame no Editor/Play, a posição 3D mundial daquele nó é projetada pela câmera ativa para coordenadas 2D da tela!
- **As 12 Subclasses de `Control`:**
  1. `Panel` (painel container estilizado)
  2. `Label` (`text`, `fontSize`, `color`, `align`)
  3. `Button` (`text`, `actionId`, método `press()`, sinal `pressed`)
  4. `CheckBox` (`checked`, `text`, método `toggle()`, sinal `toggled`)
  5. `Slider` (`min`, `max`, `step`, `value`, método `setValue(v)`, sinal `changed`)
  6. `ProgressBar` (`min`, `max`, `value`, `showPercentage`, `fillColor` — usado na barra de Energia do Pulso!)
  7. `TextureRect` (`texture`, `stretchMode`)
  8. `TextInput` (`value`, `placeholder`, `maxLength`, sinais `changed` e `submitted`)
  9. `HBox` (layout horizontal com `gap`)
  10. `VBox` (layout vertical com `gap`)
  11. `Grid` (layout em grade com `columns` e `gap`)
  12. `ScrollContainer` (container com rolagem)

---

## 6. Sistema de Scripts Nativos e Componentes Modulares (Como Tudo Funciona por Dentro)

### 6.1. Como a Engine Compila e Executa Scripts Nativos (`EngineNode.executeScripts`)
Todo `EngineNode` possui o array `this.scripts` e a referência opcional por UUID `this.scriptRef = { uuid: "..." }` (que aponta para um arquivo `.script.js` na pasta `scripts/` do projeto).

Quando um script é anexado via `node.attachScript(codigoOuObjeto, propsExportadas, nome)` ou editado ao vivo no **Inspetor de Propriedades**, a engine compila o código JavaScript em memória usando `new Function(...)` com cache de código-fonte (`script._compiledSource`), injetando automaticamente **13 argumentos nativos** no escopo do script:

| Argumento Injetado | O que é e para que serve |
|---|---|
| `node` (e `this`) | O próprio nó dono do script (`EngineNode` / `Mesh3D` / `RigidBody3DNode` / etc.) |
| `dt` | Delta time do frame atual em segundos (já escalado por `timeScale`) |
| `state` | Objeto persistente `node.userData.scriptState` mantido entre frames e limpo automaticamente ao dar `Stop` |
| `THREE` | Biblioteca `Three.js` completa (`THREE.Vector3`, `THREE.Quaternion`, `THREE.Color`, etc.) |
| `Input` | Serviço global de teclado, mouse e ações (`Input.isPressed('move_up')`, `Input.isJustPressed('action')`) |
| `Save` | Serviço de persistência versionada por slots (`Save.get('high_score', 0)`, `Save.set('high_score', 100)`) |
| `Audio` | Serviço de barramentos de áudio (`Audio.setBusVolume('sfx', 0.9)`) |
| `Log` | Serviço de diagnóstico e console da engine (`Log.info(...)`, `Log.warn(...)`, `Log.error('E301', ...)`) |
| `Rng` | Gerador pseudoaleatório determinístico Mulberry32 (`new Rng(seed)`) |
| `StateMachine` | Máquina de estados finitos (`new StateMachine({ initial, states })`) |
| `Tween` | Interpolador procedural (`node.createTween().to(...)`) |
| `Shake` | Tremor procedural (`Shake.play(node, { strength, duration })`) |
| `Easing` | 21 funções matemáticas de suavização (`Easing.easeOutBack`, `Easing.easeInOutCubic`, etc.) |

### 6.2. Os 2 Formatos Suportados de Scripts Nativos

#### Formato 1 — Script Estruturado com Hooks de Ciclo de Vida (Recomendado para Jogos)
O script retorna um objeto com os métodos de ciclo de vida (`onEnterTree`, `onReady`, `onProcess`, `onTick`, `onInput`, `onExitTree`, `onDestroy`):
```javascript
// Exemplo de arquivo: scripts/main.script.js
return {
  onReady(node, state) {
    state.velocidade = 4.5;
    state.rng = new Rng(2026);
    Log.info(`Nó "${node.name}" pronto na posição global:`, node.position_global);
  },

  onProcess(dt, node, state) {
    // Gira o objeto 45 graus por segundo no eixo Y
    node.rotate({ x: 0, y: 1, z: 0 }, 45 * dt, 'local');

    // Move com WASD / Setas usando o serviço nativo Input
    if (Input.isPressed('move_up')) {
      node.translate({ x: 0, y: 0, z: -state.velocidade * dt }, 'global');
    }
    if (Input.isJustPressed('action')) {
      node.shake({ strength: 0.2, duration: 0.25 });
    }
  },

  onTick(fixedPeriod, node, state) {
    // Executado em cadência fixa se node.tickRate > 0 (ex.: tickRate = 20 -> 20 vezes por segundo)
  },

  onInput(evento, node, state) {
    // Recebe eventos despachados via root.dispatchInput(evento)
  },

  onDestroy(node) {
    Log.info(`Nó "${node.name}" destruído.`);
  }
};
```

#### Formato 2 — Script Direto por Frame (Expressão Rápida no Inspetor)
Você também pode escrever código imperativo direto sem `return { ... }`. Ele será executado a cada frame durante o modo `Play`, usando `state` para guardar variáveis entre frames:
```javascript
if (!state.iniciado) {
  state.iniciado = true;
  state.angulo = 0;
}
state.angulo += dt * 2.5;
node.position = {
  x: node.position.x,
  y: 1.5 + Math.sin(state.angulo) * 0.6,
  z: node.position.z
};
```

### 6.3. Scripts / Componentes Modulares Embutidos (`node.components`) — Física como Script (`PhysicsScript`)
Além dos scripts `.script.js`, qualquer nó pode receber scripts/componentes modulares prontos com 1 clique no Inspetor Direito (`_executeBehaviorComponents(dt)`):
1. **`Physics` (`PhysicsScript` — Física separada da Colisão):** aplica simulação física diretamente como um script modular (`bodyType: 'dynamic' | 'static' | 'kinematic'`, `mass`, `gravityY`, `restitution` / quique, `linearDamping` e `floorY`), funcionando tanto de forma autônoma em qualquer `Mesh3D` / `Node3D` quanto integrado ao `cannon-es` quando acompanhado de um `CollisionShape3D`.
2. **`Rotator`**: gira continuamente o nó nos eixos X, Y e Z (`speedX`, `speedY`, `speedZ` em graus/segundo).
3. **`Oscillator`**: aplica movimento harmônico senoidal (`Math.sin(t * frequency * 2π) * amplitude`) no eixo escolhido (`x`, `y` ou `z`) a partir da posição base original.
4. **`Thruster`**: acumula tempo e, a cada `interval` segundos, aplica um impulso vertical `impulseY` (tanto em `PhysicsScript` quanto em `CANNON.Body`).
5. **`PulseScale`**: pulsa suavemente a escala 3D do objeto com `amplitude` e `frequency`.
6. **`CustomScript`**: avalia uma expressão matemática rápida `(node, t, dt, Math)` a cada frame.

---

## 7. Classes Nativas, Serviços Globais, Recursos e Códigos de Erro (`E101`–`E501`)

**Arquivo:** `src/engine/core/NativeClasses.js`

### 7.1. Tabela de Códigos Estruturados de Diagnóstico (`ENGINE_ERROR_CODES`)
| Código | Descrição Oficial | Quando é Disparado |
|---|---|---|
| **`E101`** | Nó não encontrado no caminho informado | Ao chamar `node.getNode('/caminho/inexistente')` |
| **`E102`** | Ciclo na árvore de nós (nó adicionado dentro de si mesmo) | Ao tentar `node.add(node)` ou reparentar um pai para dentro de seu próprio filho |
| **`E103`** | Nome único (`%Nome`) duplicado na mesma cena | Ao adicionar dois nós com `uniqueName: true` e o mesmo `name` na mesma árvore |
| **`E201`** | Recurso não encontrado ou falha ao carregar arquivo | Ao buscar um recurso inexistente em `ResourceRegistry.get(path)` |
| **`E202`** | Formato de arquivo incompatível com o tipo de recurso | Ao tentar carregar um recurso com estrutura inválida |
| **`E301`** | Erro na execução de método do script (com linha e pilha) | Exceção em `onReady`, `onProcess`, `onTick` ou listener de `Signal` (capturada sem travar a engine!) |
| **`E302`** | Propriedade exportada com valor de tipo diferente do declarado | Falha na validação de schema em `DataResource.validate()` |
| **`E401`** | Corpo físico sem `CollisionShape3D` filho | Diagnóstico de `RigidBody3DNode` sem colisor |
| **`E501`** | Sinal emitido ou conectado sem ter sido declarado no nó | Ao chamar `emit()` ou `connect()` em um sinal ainda não registrado com `defineSignal()` |

### 7.2. Detalhamento das Classes Nativas (`NativeClasses.js`)
- **`Signal`**: canal pub/sub com `connect(fn, alvo)`, `once(fn, alvo)`, `disconnect(fn, alvo)`, `emit(...args)` e `waitFor()` (retorna `Promise`).
- **`Easing`**: 21 funções puras `f(t)` (`linear`, `easeInSine`, `easeOutSine`, `easeInOutSine`, `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeInQuart`, `easeOutQuart`, `easeInOutQuart`, `easeInExpo`, `easeOutExpo`, `easeInOutExpo`, `easeInBack`, `easeOutBack`, `easeInOutBack`, `easeInBounce`, `easeOutBounce`, `easeInOutBounce`).
- **`Tween`**: interpolador encadeável com `.to(alvo, valoresFinais, duracao, easing)`, `.custom(fn, de, ate, duracao, easing)`, `.wait(segundos)`, `.call(fn)`, `.parallel()`, `.sequence()`, `.loop(vezes)`, `.pause()`, `.resume()`, `.kill()` e sinais `finished` / `stepFinished`.
- **`Rng`**: gerador pseudoaleatório determinístico **Mulberry32** com semente numérica ou textual (hash FNV-1a):
  - `next()` (`[0, 1)`), `int(min, max)`, `float(min, max)`, `chance(probabilidade)`, `pick(lista)`, `weighted(listaComPesos)`, `shuffle(lista)`, `fork()`, `getState()`, `setState(estado)`.
- **`Shake`**: tremor procedural não-destrutivo. A cada frame subtrai `_lastOffset` antes de somar o novo deslocamento aleatório amortecido por envelope `linear` ou `exponential`, garantindo que ao terminar (`stop()`), o nó volte **exatamente** para sua coordenada original (mesmo se o nó estiver se movendo ao mesmo tempo).
- **`StateMachine`**: máquina de estados finitos com `states` (`enter`, `update`, `exit`, `allowedTransitions`), `can(novoEstado)`, `go(novoEstado, dados)`, `update(dt)`, `current`, `previous`, `history` e sinal `stateChanged`.
- **`Save`**: persistência chave-valor com suporte a múltiplos slots (`Save.slot('slot_1')`), armazenamento híbrido (`Map` em memória RAM para Node.js + `localStorage` no Browser) e sistema de migração de versão (`Save.migrate(versaoAntiga, fn)`).
- **`Input`**: gerenciador unificado de entrada com ações mapeáveis (`bindAction`), `isPressed(acaoOuTecla)`, `isJustPressed(acaoOuTecla)`, `isJustReleased(acaoOuTecla)`, estado de ponteiro (`getPointer()`) e limpeza por frame (`stepFrame()`).
- **Recursos Nativos:** `Material`, `ImageTexture`, `Canvas2D` (comandos vetoriais `rect`, `roundRect`, `circle`, `line`, `polygon`, `text`, `withTransform`), `CanvasTexture`, `Curve3D`, `AnimationClip`, `Theme`, `DataResource`, `ResourceRegistry`, `Audio` e `Playlist`.

---

## 8. Serialização Atômica, `NodeFactory` e Resiliência contra Corrupção

### 8.1. `NodeFactory` (`src/engine/serialization/NodeFactory.js`)
- Reconstrói recursivamente qualquer árvore de cena a partir de JSON (`NodeFactory.deserialize(json)`).
- **Suporte Transparente a Containers `.scene.json` e Legados `.scene`:** aceita tanto o formato container `{ format: "maxros.scene", version: 1, root: { ... } }` quanto o nó raiz direto.
- **Clonagem Profunda com Novos UUIDs (`NodeFactory.cloneSubtreeWithFreshUuids`):** permite duplicar qualquer nó ou subárvore inteira (`Ctrl+D` ou Copiar/Colar no Editor) gerando novos UUIDs para toda a hierarquia clonada e deslocando-a suavemente.
- **Tolerância a Nós Desconhecidos:** se um arquivo `.scene.json` contiver um `type` de uma versão futura ou plugin externo não registrado, a `NodeFactory` **não falha**: ela instancia um `EngineNode` fallback, preserva todos os atributos desconhecidos em `unknownNodeAttributes` e o `originalUnknownType`, garantindo zero perda de dados ao salvar a cena novamente.

### 8.2. Escrita Atômica (`EditorSceneManager.js`)
Salvar cenas diretamente sobre o arquivo original poderia corromper o projeto se o processo caísse no meio da gravação. Por isso, `EditorSceneManager.writeAtomicSceneJson()` executa:
1. Serializa a cena e valida com `JSON.parse()` em memória.
2. Grava primeiro em um arquivo temporário `.<nome>.<timestamp>.tmp.scene.json`.
3. Força o flush físico para o disco via descritor de arquivo (`fs.fsyncSync(fd)`).
4. Substitui o arquivo final em uma única operação atômica de sistema operacional (`fs.renameSync(tmpFile, targetFile)`).
5. Garante que o sidecar `.uuid` da cena seja preservado intacto.

---

## 9. Editor Visual 3D, Menu Dropdown `+`, Escolha do Nó Pai da Cena, Ferramentas de Câmera e Gizmos

**Arquivos:** `src/App.tsx` e `src/engine/helpers/EditorGuides.js`

O Editor Visual 3D da Maxros Engine divide a tela em 3 colunas produtivas + barra superior e gaveta inferior:
1. **Painel Esquerdo com Menu Dropdown `+` e Cena Pai Flexível (Sem `"Árvore de Nós"` e sem `"MainSceneRoot"`):**
   - O cabeçalho textual `"Árvore de Nós"` e o nó fixo `"MainSceneRoot"` foram removidos.
   - No topo do painel esquerdo há um botão **`+ Adicionar Nó` (Dropdown)** com todos os tipos de nós pré-existentes da engine (`Node3D`, `Mesh3D`, `CollisionShape3D`, `Camera3D`, `DirectionalLight3D`, `PointLight3D`, `Sprite3D`, `Particles3D`, `Path3D`, `UILayer`, `AnimationPlayer`, `Timer`, `Node`), além do botão **Nova Cena** e **Ambiente**.
   - Quando uma cena começa vazia (ou ao clicar em **Nova Cena** / excluir o nó raiz), o editor solicita que você **escolha um tipo de nó pré-existente para agir como Cena Pai (Raiz)** (`depth === 0`), e esse nó fica no topo da hierarquia podendo ser renomeado, transformado, inspecionado e receber scripts normalmente.
2. **Menu de Modo de Câmera do Editor (Canto Superior Esquerdo do Viewport):**
   - Controla exclusivamente a **Câmera do Editor** (nunca serializada na cena).
   - Alterna instantaneamente entre **Perspectiva (`THREE.PerspectiveCamera`)** e **Ortográfica (`THREE.OrthographicCamera`)**.
   - Menu **Visão / Alinhamento Rápido** com interpolação suave (`computeEditorCameraPresetPose`):
     - **Visão de Cima (Top):** Eixo `Y+` olhando para baixo.
     - **Visão de Baixo (Bottom):** Eixo `Y-` olhando para cima.
     - **Visão Esquerda (Left):** Eixo `X-` olhando para a direita.
     - **Visão Direita (Right):** Eixo `X+` olhando para a esquerda.
     - **Visão Frontal (Front):** Eixo `Z+` olhando para trás.
     - **Visão Traseira (Back):** Eixo `Z-` olhando para frente.
3. **Gizmo de Navegação 3D (`ViewCube` / Eixos Interativos — Canto Superior Direito do Viewport):**
   - Widget interativo com os 6 eixos (**X vermelho**, **Y verde**, **Z azul**, `-X`, `-Y`, `-Z`) sincronizado com a rotação inversa da Câmera do Editor. Clicar em qualquer eixo alinha a câmera suavemente àquela vista.
4. **Representação 3D da Própria Câmera (`Camera3D`), Ícone, Linhas de Direção (`-Z`) e `THREE.CameraHelper`:**
   - Cada `Camera3D` possui chassi 3D, lente, bobinas, ícone flutuante e linhas de direção `-Z` com seta indicando para onde aponta.
   - Quando selecionada na hierarquia ou no Viewport, exibe o `THREE.CameraHelper` amarelo mostrando o cone real de visão (`FOV`, `Aspect`, `Size`, `Near`, `Far`) atualizado em tempo real (`helper.update()`).
5. **Painel "Camera Preview" Picture-in-Picture (Inspetor Direito):**
   - Quando um `Camera3D` está selecionado e a seção **"Camera Preview"** está aberta, o loop principal realiza uma renderização extra no mesmo `THREE.WebGLRenderer` (`setViewport` + `setScissor`) e copia a imagem limpa (sem grades nem gizmos do editor) para o `<canvas>` secundário no Inspetor.

---

## 10. Jogo Demonstrativo Oficial: *Guardião Geométrico: Arena dos Cristais*

**Arquivo:** `src/engine/demos/GeometricMiniGame.js` e `projects/guardiao-geometrico-demo/`

Para demonstrar todos os sistemas da Maxros Engine trabalhando juntos em tempo real, a engine inclui o mini-game jogável **Guardião Geométrico: Arena dos Cristais**:
- **Construído 100% com Nós Nativos da Engine:**
  - `Camera3D` (`ArenaCamera`) + `DirectionalLight3D` (`SunLight`) + `HemisphereLight3D` (`SkyAmbientLight`).
  - Arena octogonal construída com `Mesh3D` (`ArenaFloor`, `ArenaBorderRing` toroidal, 4 pilares `Pillar_1..4` com orbes animados por `AnimationPlayer`).
  - **Jogador (`%PlayerCore`):** `Mesh3D` icosaedro com anel orbital (`PlayerRing`), emissor de partículas (`%PlayerParticles`), rótulo 3D (`%PlayerFloatingTag`) e script nativo controlador completo (`GuardiaoPlayerController`).
  - **5 Cristais Colecionáveis (`Crystal_0..4` no grupo `'crystals'`):** octaedros dourados animados com `AnimationPlayer` (`float_spin`).
  - **2 Sentinelas Patrulheiras (`PatrolPath_1/2` → `PathFollow3D` → `SentinelMesh_1/2`):** cones vermelhos que patrulham trilhas 3D orientando-se automaticamente pela tangente da curva (`rotateAlongPath: true`).
  - **HUD 2D Completo (`UILayer` → `Panel` → `Label` / `ProgressBar` / `Button`):** placar de cristais e recorde persistente (`Save`), estado atual da `StateMachine` (`ocioso`, `movendo`, `pulso`, `vitoria`), barra de energia do pulso (`ProgressBar`) e tag 2D ancorada em tempo real sobre o jogador 3D (`Control.anchorTo3D('%PlayerCore')`).

---

## 11. As 27 Baterias de Testes Automatizados (`src/engine/validate.js`)

Executadas via `npm test` (`node src/engine/validate.js`), validando toda a engine em Node.js headless:
1. **Transform Math (`Local ↔ Global` under Rotated/Scaled Parent):** valida precisão matemática de `position_global` sob pai rotacionado e escalado.
2. **Reparenting Preserving World Transform (`Parent ↔ Child ↔ Root`):** valida que `reparentPreservingWorldTransform` mantém a posição, rotação e escala globais inalteradas.
3. **`Sprite3DNode`, Visibility/Lock Flags & Behavior Scripts (`Rotator`/`Oscillator`):** valida texturas headless, flags de editor e componentes de comportamento.
4. **Multi-Body Mid-Collision Reset (13 Bodies):** valida simulação física `cannon-es` e reset determinístico no meio de colisões.
5. **Subtree Cloning & Unknown Node Resilience:** valida `cloneSubtreeWithFreshUuids` e preservação de nós desconhecidos na serialização.
6. **Atomic Disk Save & Load (`.tmp.scene` → `fs.renameSync`):** valida escrita atômica em disco sem arquivos temporários órfãos.
7. **Scene Environment Save & Load Preserves Color (`#2a3b4c`):** valida persistência da cor de fundo da cena.
8. **Legacy Scene Without Environment Fallback (`#1e2430`):** valida fallback seguro para cenas sem bloco `environment`.
9. **Editor Guides Excluded from `.scene` Serialization:** garante que `GridHelper`, `AxesHelper` e helpers com `isViewportHelper: true` jamais poluam o JSON salvo.
10. **Editor Guides Non-Selectable & Non-Blocking in Raycast:** garante que clicar através da grade seleciona objetos abaixo dela ou limpa a seleção.
11. **`Node`, `Node3D`, `SceneTree`, `%UniqueName` Paths, Groups & Signals:** valida busca `%Nome`, grupos em lote e sinais pub/sub.
12. **3D Nodes (`Mesh3D` 9 Shapes, `Camera3D`, Lights, `Label3D`, `Particles3D`, `PickArea3D`):** valida instanciação, projeção de câmera e serialização de todos os nós 3D.
13. **`Path3D`, `Curve3D` & `PathFollow3D` Interpolation:** valida amostragem de curvas 3D e avanço automático ao longo do caminho.
14. **`Timer`, `AnimationPlayer`, `Tween`, `Easing` & `Shake`:** valida keyframes, trilhas de evento, tweens encadeados e restauração exata de pose após `Shake`.
15. **`Rng`, `StateMachine`, `Save`, `Input`, `Canvas2D` & Error Codes (`E101`–`E501`):** valida determinismo do Mulberry32, máquina de estados, migração de save e captura de erros estruturados.
16. **`UILayer` & `Control` Subclasses (`Panel`, `Label`, `Button`, `CheckBox`, `Slider`, `ProgressBar`):** valida árvore de interface 2D e ancoragem 3D (`anchorTo3D`).
17. **Playable Geometric Mini-Game (3D Map, UI HUD, Animations, PathFollow & Scripts):** valida execução completa do jogo *Guardião Geométrico* em modo headless (coleta de cristais, pulso e vitória).
18. **Maxros Project Creation, `maxros.project.json`, Reproducible Core Lockfile & 3 Templates:** valida criação de projetos nos 3 templates (`standard_3d`, `empty`, `geometric_demo`) e isolamento do `core/`.
19. **Dynamic Project Root (`project://`) Switching & Path Traversal Protection:** valida troca dinâmica da raiz `project://` entre projetos e bloqueio de `../`.
20. **Selective `.uuid` Sidecar Rule:** valida que recursos recebem `.uuid` enquanto `maxros.project.json`, `core/`, `.maxros/` e `*.uuid` nunca recebem sidecars.
21. **UUID Lifecycle (Edit, Rename, Move Across Directories, Delete & Recreate):** valida que editar, renomear ou mover preserva o UUID, deletar remove o sidecar e recriar gera novo UUID.
22. **UUID Reference Survival After Moving Main Scene & Linked Scripts:** valida que mover `main.scene.json` e scripts vinculados para outras subpastas não quebra o carregamento do projeto.
23. **Missing `.uuid` Sidecar Recovery & Non-Silent Duplicate UUID Conflict Resolution:** valida recuperação de sidecar apagado e detecção/resolução explícita de conflito de UUID duplicado.
24. **`.maxros/` Internal Cache Deletion Resilience & Auto-Regeneration:** valida reconstrução automática da pasta `.maxros/` ao abrir o projeto.
25. **Safe Non-Destructive Legacy Project Migration:** valida migração automática e não-destrutiva de projetos legados (`project.core3d` / `.scene` → `maxros.project.json` / `.scene.json`).
26. **`Camera3DNode` Icon & Direction Lines, `THREE.CameraHelper` Frustum & Editor Camera Presets:** valida o alias `Camera3DNode`, o helper visual 3D com ícone e linhas de direção `-Z`, o `THREE.CameraHelper` dinâmico e os 6 presets ortogonais da Câmera do Editor (`Top`, `Bottom`, `Left`, `Right`, `Front`, `Back`).
27. **Separated `CollisionShape3D` (`Box`, `Sphere`, `Cylinder`, `Trimesh` / `MeshCollider`) & `PhysicsScript` Component:** valida o colisor `Trimesh` (`CANNON.Trimesh`) moldado automaticamente pelo desenho do modelo 3D (`Mesh3D`), o colisor `Cylinder` e a execução de gravidade/colisão via componente de script `PhysicsScript`.

---

## 12. Integração de Skills e Superpowers (`obra/superpowers` v7.0.2)

O repositório oficial [`https://github.com/obra/superpowers`](https://github.com/obra/superpowers) (v7.0.2) foi clonado, instalado e executado (`./superpowers/hooks/session-start`) diretamente em `/superpowers` na raiz do projeto.

### Estrutura Instalada em `/superpowers`:
```text
/superpowers
├── package.json                                # Manifesto superpowers v7.0.2
├── index.js                                    # Entrypoint do plugin (.opencode/plugins/superpowers.js)
├── gemini-extension.json                       # Extensão Gemini (contextFileName: GEMINI.md)
├── GEMINI.md / AGENTS.md / README.md           # Diretrizes e documentação oficial do Superpowers
├── hooks/
│   ├── session-start                           # Script de bootstrap e injeção de contexto da sessão
│   ├── hooks.json                              # Configuração de hooks de ciclo de vida
│   └── run-hook.cmd                            # Executor multiplataforma de hooks
└── skills/                                     # 15 Skills de Engenharia de Software instaladas:
    ├── brainstorming/                          # Refinamento colaborativo de design antes da implementação
    ├── diagnosing-superpowers/                 # Diagnóstico de instalação e funcionamento das skills
    ├── dispatching-parallel-agents/            # Coordenação de múltiplos agentes em paralelo
    ├── executing-plans/                        # Execução controlada de planos de implementação
    ├── finishing-a-development-branch/         # Checklist e encerramento estruturado de branches
    ├── receiving-code-review/                  # Protocolo técnico para recebimento de code reviews
    ├── requesting-code-review/                 # Protocolo para solicitação de revisão de código
    ├── subagent-driven-development/            # Desenvolvimento orientado a subagentes com revisão em 2 estágios
    ├── systematic-debugging/                   # Depuração sistemática baseada em evidências e causa-raiz
    ├── test-driven-development/                # Ciclo TDD rigoroso (Red -> Green -> Refactor)
    ├── using-git-worktrees/                    # Isolamento de workspaces com Git Worktrees
    ├── using-superpowers/                      # Regra central de ativação e prioridade de skills
    ├── verification-before-completion/         # Verificação obrigatória de testes e build antes de concluir
    ├── writing-plans/                          # Criação de planos granulares de engenharia
    └── writing-skills/                         # Guia para autoria de novas skills
```
