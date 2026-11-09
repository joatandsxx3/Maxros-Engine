import { EngineNode, Node3D } from '../nodes/EngineNode.js';
import {
  Camera3D,
  DirectionalLight3D,
  PointLight3D,
  Mesh3D,
  Particles3D,
  Path3D,
  PathFollow3D,
  PickArea3D,
  Timer,
  AnimationPlayer,
  UILayer,
  Panel,
  Label,
  Button,
  ProgressBar
} from '../nodes/SceneNodes.js';
import { Curve3D, AnimationClip } from '../core/NativeClasses.js';

/**
 * Constrói a cena completa do mini-jogo jogável "Guardião Geométrico: Arena dos Cristais"
 * usando exclusivamente formas geométricas nativas (Mesh3D), caminhos (Path3D/PathFollow3D),
 * animações (AnimationPlayer + Tween + Shake), partículas (Particles3D), UI (UILayer + Controls)
 * e scripts em nós.
 */
export function createGeometricMiniGameScene() {
  const root = new EngineNode('GuardiaoGeometrico_Cena');
  root.setEnvironment({
    mode: 'solid_color',
    color: '#0f172a',
    skybox: null
  });

  // ============================================================================
  // 1. CÂMERA E ILUMINAÇÃO 3D
  // ============================================================================
  const gameCamera = new Camera3D('MainCamera', {
    current: true,
    projection: 'perspective',
    fov: 52,
    near: 0.1,
    far: 200
  });
  gameCamera.uniqueName = true;
  gameCamera.position = { x: 0, y: 9.5, z: 11.5 };
  gameCamera.setRotationDegrees({ x: -38, y: 0, z: 0 });
  root.add(gameCamera);

  const sunLight = new DirectionalLight3D('SolDirecional', {
    color: '#f8fafc',
    intensity: 1.6,
    castShadow: true
  });
  sunLight.position = { x: 8, y: 14, z: 6 };
  root.add(sunLight);

  const centerBeaconLight = new PointLight3D('LuzCentralArena', {
    color: '#38bdf8',
    intensity: 2.2,
    range: 18
  });
  centerBeaconLight.position = { x: 0, y: 3.5, z: 0 };
  root.add(centerBeaconLight);

  // ============================================================================
  // 2. MAPA GEOMÉTRICO 3D (Apenas Formas Geométricas Mesh3D)
  // ============================================================================
  const mapGroup = new Node3D('MapaGeometrico');
  mapGroup.uniqueName = true;
  root.add(mapGroup);

  const arenaFloor = new Mesh3D('PlataformaOctogonal', {
    shape: 'cylinder',
    shapeParams: { radiusTop: 7.5, radiusBottom: 8.2, height: 0.6, radialSegments: 8 },
    material: {
      type: 'standard',
      color: '#1e293b',
      roughness: 0.6,
      metalness: 0.3
    }
  });
  arenaFloor.position = { x: 0, y: -0.3, z: 0 };
  mapGroup.add(arenaFloor);

  const arenaRing = new Mesh3D('AnelEnergiaArena', {
    shape: 'torus',
    shapeParams: { radius: 5.2, tube: 0.08, radialSegments: 12, tubularSegments: 48 },
    material: {
      type: 'standard',
      color: '#0ea5e9',
      emissive: '#0284c7',
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.8
    }
  });
  arenaRing.position = { x: 0, y: 0.05, z: 0 };
  arenaRing.setRotationDegrees({ x: 90, y: 0, z: 0 });
  mapGroup.add(arenaRing);

  const pillarCoords = [
    { name: 'ObeliscoNorte', x: 0, z: -6.2, color: '#38bdf8' },
    { name: 'ObeliscoSul', x: 0, z: 6.2, color: '#38bdf8' },
    { name: 'ObeliscoLeste', x: 6.2, z: 0, color: '#818cf8' },
    { name: 'ObeliscoOeste', x: -6.2, z: 0, color: '#818cf8' }
  ];

  for (const pc of pillarCoords) {
    const pillar = new Mesh3D(pc.name, {
      shape: 'cylinder',
      shapeParams: { radiusTop: 0.28, radiusBottom: 0.42, height: 2.2, radialSegments: 6 },
      material: {
        type: 'standard',
        color: '#334155',
        roughness: 0.4,
        metalness: 0.5
      }
    });
    pillar.position = { x: pc.x, y: 1.1, z: pc.z };

    const cap = new Mesh3D(`${pc.name}_Topo`, {
      shape: 'cone',
      shapeParams: { radius: 0.38, height: 0.7, radialSegments: 6 },
      material: {
        type: 'standard',
        color: pc.color,
        emissive: pc.color,
        emissiveIntensity: 0.5
      }
    });
    cap.position = { x: 0, y: 1.45, z: 0 };
    pillar.add(cap);
    mapGroup.add(pillar);
  }

  // ============================================================================
  // 3. TRILHA 3D E DRONE SENTINELA (Path3D + PathFollow3D + Mesh3D)
  // ============================================================================
  const patrolCurve = new Curve3D([
    { x: -3.8, y: 0.8, z: -3.8 },
    { x: 3.8, y: 1.2, z: -3.8 },
    { x: 3.8, y: 0.8, z: 3.8 },
    { x: -3.8, y: 1.2, z: 3.8 },
    { x: -3.8, y: 0.8, z: -3.8 }
  ]);
  const patrolPath = new Path3D('TrilhaPatrulha', patrolCurve);
  root.add(patrolPath);

  const droneFollower = new PathFollow3D('SeguidorTrilha', {
    progress: 0,
    speed: 0.14,
    loop: true,
    rotateAlongPath: true
  });
  patrolPath.add(droneFollower);

  const sentinelDrone = new Mesh3D('DroneSentinela', {
    shape: 'torusKnot',
    shapeParams: { radius: 0.38, tube: 0.11, tubularSegments: 36, radialSegments: 10 },
    material: {
      type: 'standard',
      color: '#f43f5e',
      emissive: '#e11d48',
      emissiveIntensity: 0.65,
      roughness: 0.25,
      metalness: 0.7
    }
  });
  sentinelDrone.uniqueName = true;
  sentinelDrone.addToGroup('perigos');
  sentinelDrone.components.push({
    id: 'comp_drone_spin',
    type: 'Rotator',
    enabled: true,
    params: { speedX: 90, speedY: 140, speedZ: 0 }
  });
  droneFollower.add(sentinelDrone);

  // ============================================================================
  // 4. CRISTAIS COLETÁVEIS COM ANIMAÇÃO E PICKAREA3D
  // ============================================================================
  const crystalConfigs = [
    { name: 'CristalCiano', x: -2.8, z: -2.2, color: '#38bdf8', emissive: '#0284c7' },
    { name: 'CristalDourado', x: 2.9, z: -1.8, color: '#fbbf24', emissive: '#d97706' },
    { name: 'CristalVioleta', x: 0.2, z: 3.1, color: '#a855f7', emissive: '#7e22ce' }
  ];

  for (let i = 0; i < crystalConfigs.length; i++) {
    const cfg = crystalConfigs[i];
    const crystal = new Mesh3D(cfg.name, {
      shape: 'octahedron',
      shapeParams: { radius: 0.52, detail: 0 },
      material: {
        type: 'standard',
        color: cfg.color,
        emissive: cfg.emissive,
        emissiveIntensity: 0.55,
        roughness: 0.15,
        metalness: 0.6
      }
    });
    crystal.position = { x: cfg.x, y: 0.75, z: cfg.z };
    crystal.addToGroup('cristais');
    crystal.components.push({
      id: `comp_crys_rot_${i}`,
      type: 'Rotator',
      enabled: true,
      params: { speedX: 0, speedY: 85 + i * 20, speedZ: 25 }
    });

    const animPlayer = new AnimationPlayer(`${cfg.name}_Anim`, {
      rootNode: '..',
      autoplay: 'float_loop',
      playing: true,
      speed: 1.0 + i * 0.15
    });
    animPlayer.addClip(
      new AnimationClip({
        name: 'float_loop',
        length: 1.6,
        loop: true,
        tracks: [
          {
            type: 'property',
            path: '.',
            property: 'scale',
            easing: 'easeInOutSine',
            keyframes: [
              { time: 0.0, value: { x: 0.9, y: 0.9, z: 0.9 } },
              { time: 0.8, value: { x: 1.2, y: 1.2, z: 1.2 } },
              { time: 1.6, value: { x: 0.9, y: 0.9, z: 0.9 } }
            ]
          }
        ]
      })
    );
    crystal.add(animPlayer);

    const pickArea = new PickArea3D(`${cfg.name}_PickArea`, {
      shape: 'sphere',
      size: { radius: 0.85 },
      cursor: 'pointer'
    });
    crystal.add(pickArea);

    root.add(crystal);
  }

  // ============================================================================
  // 5. EMISSOR DE PARTÍCULAS DE COLETA (Particles3D)
  // ============================================================================
  const collectBurstFX = new Particles3D('CollectBurstFX', {
    emitting: false,
    oneShot: true,
    amount: 28,
    lifetime: 0.75,
    speedMin: 2.0,
    speedMax: 4.8,
    colorOverLife: ['#fde047', '#38bdf8']
  });
  collectBurstFX.uniqueName = true;
  collectBurstFX.position = { x: 0, y: 0.8, z: 0 };
  root.add(collectBurstFX);

  // ============================================================================
  // 6. JOGADOR GEOMÉTRICO (Mesh3D + AnimationPlayer + Script Controlador)
  // ============================================================================
  const playerCore = new Mesh3D('PlayerCore', {
    shape: 'icosahedron',
    shapeParams: { radius: 0.58, detail: 0 },
    material: {
      type: 'standard',
      color: '#10b981',
      emissive: '#059669',
      emissiveIntensity: 0.45,
      roughness: 0.2,
      metalness: 0.5
    }
  });
  playerCore.uniqueName = true;
  playerCore.position = { x: 0, y: 0.65, z: 0 };
  playerCore.addToGroup('jogador');

  const playerHalo = new Mesh3D('PlayerHalo', {
    shape: 'torus',
    shapeParams: { radius: 0.82, tube: 0.055, radialSegments: 12, tubularSegments: 28 },
    material: {
      type: 'standard',
      color: '#34d399',
      emissive: '#10b981',
      emissiveIntensity: 0.7
    }
  });
  playerHalo.setRotationDegrees({ x: 90, y: 0, z: 0 });
  playerHalo.components.push({
    id: 'comp_halo_rot',
    type: 'Rotator',
    enabled: true,
    params: { speedX: 45, speedY: 120, speedZ: 0 }
  });
  playerCore.add(playerHalo);

  const playerAnim = new AnimationPlayer('PlayerAnim', {
    rootNode: '..',
    autoplay: 'idle_breath',
    playing: true
  });
  playerAnim.uniqueName = true;
  playerAnim.addClip(
    new AnimationClip({
      name: 'idle_breath',
      length: 1.4,
      loop: true,
      tracks: [
        {
          type: 'property',
          path: '.',
          property: 'scale',
          easing: 'easeInOutSine',
          keyframes: [
            { time: 0.0, value: { x: 1.0, y: 1.0, z: 1.0 } },
            { time: 0.7, value: { x: 1.12, y: 1.12, z: 1.12 } },
            { time: 1.4, value: { x: 1.0, y: 1.0, z: 1.0 } }
          ]
        }
      ]
    })
  );
  playerAnim.addClip(
    new AnimationClip({
      name: 'collect_pop',
      length: 0.35,
      loop: false,
      tracks: [
        {
          type: 'property',
          path: '.',
          property: 'scale',
          easing: 'easeOutBack',
          keyframes: [
            { time: 0.0, value: { x: 1.48, y: 1.48, z: 1.48 } },
            { time: 0.35, value: { x: 1.0, y: 1.0, z: 1.0 } }
          ]
        }
      ]
    })
  );
  playerCore.add(playerAnim);

  // Script principal do jogo anexado ao PlayerCore
  const gameScriptCode = `
return {
  onReady(node, state) {
    state.score = 0;
    state.collected = 0;
    state.energy = 100;
    state.seed = 2026;
    state.rng = new Rng(state.seed);
    state.speed = 5.4;
    state.targetPoint = null;
    state.invulnTimer = 0;

    state.fsm = new StateMachine({
      initial: 'EXPLORANDO',
      states: {
        EXPLORANDO: {
          enter() {
            const lbl = node.getNodeOrNull('%StateLabel');
            if (lbl) lbl.text = 'Estado: EXPLORANDO (WASD / Setas ou Clique em um Cristal)';
          }
        },
        PULSO_MAGNETICO: {
          enter() {
            const lbl = node.getNodeOrNull('%StateLabel');
            if (lbl) lbl.text = 'Estado: ⚡ PULSO MAGNÉTICO ATIVO!';
          }
        },
        ALERTA_IMPACTO: {
          enter() {
            const lbl = node.getNodeOrNull('%StateLabel');
            if (lbl) lbl.text = 'Estado: ⚠️ IMPACTO COM DRONE SENTINELA!';
          }
        }
      }
    });

    node.defineSignal('crystalCollected');
    Log.tag('MiniGame').info('Guardião Geométrico iniciado! Use WASD/Setas ou clique nos cristais.');
  },

  onProcess(dt, node, state) {
    if (!state.rng) return;
    if (state.invulnTimer > 0) state.invulnTimer = Math.max(0, state.invulnTimer - dt);

    // 1. Leitura de teclado (WASD / Setas)
    let dx = 0;
    let dz = 0;
    if (Input.isPressed('move_left')) dx -= 1;
    if (Input.isPressed('move_right')) dx += 1;
    if (Input.isPressed('move_up')) dz -= 1;
    if (Input.isPressed('move_down')) dz += 1;

    if (dx !== 0 || dz !== 0) {
      state.targetPoint = null;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
    } else if (state.targetPoint) {
      const tx = state.targetPoint.x - node.position.x;
      const tz = state.targetPoint.z - node.position.z;
      const dist = Math.hypot(tx, tz);
      if (dist > 0.15) {
        dx = tx / dist;
        dz = tz / dist;
      } else {
        state.targetPoint = null;
      }
    }

    // 2. Pulso magnético por tecla Espaço ou ação da UI
    if (Input.isJustPressed('action') || state.triggerPulse) {
      state.triggerPulse = false;
      if (state.energy >= 25) {
        state.energy = Math.max(0, state.energy - 25);
        state.fsm.go('PULSO_MAGNETICO');
        const tree = node.getTree();
        const crystals = tree ? tree.getNodesInGroup('cristais') : [];
        for (const c of crystals) {
          node.createTween().to(c.position, { x: node.position.x, y: 0.75, z: node.position.z }, 0.22, 'easeInQuad');
        }
      }
    }

    // 3. Re-sortear mapa (Seed RNG)
    if (state.triggerReroll) {
      state.triggerReroll = false;
      state.seed += 7;
      state.rng = new Rng(state.seed);
      const tree = node.getTree();
      const crystals = tree ? tree.getNodesInGroup('cristais') : [];
      for (const c of crystals) {
        const angle = state.rng.float(0, Math.PI * 2);
        const radius = state.rng.float(1.6, 4.6);
        c.position = { x: Math.cos(angle) * radius, y: 0.75, z: Math.sin(angle) * radius };
      }
      Log.tag('MiniGame').info('Novo mapa gerado com Seed #' + state.seed);
    }

    // 4. Atualizar posição do Jogador limitada ao octógono da arena
    const nextX = Math.max(-5.2, Math.min(5.2, node.position.x + dx * state.speed * dt));
    const nextZ = Math.max(-5.2, Math.min(5.2, node.position.z + dz * state.speed * dt));
    node.position = { x: nextX, y: 0.65, z: nextZ };
    node.rotation.y += dt * 1.8;

    // Regenerar energia lentamente
    state.energy = Math.min(100, state.energy + dt * 6);

    // 5. Checar coleta de Cristais
    const tree = node.getTree();
    const crystals = tree ? tree.getNodesInGroup('cristais') : [];
    for (const c of crystals) {
      const dist = Math.hypot(c.position.x - node.position.x, c.position.z - node.position.z);
      if (dist < 1.05) {
        state.collected += 1;
        state.score += 100;
        state.energy = Math.min(100, state.energy + 15);
        Save.set('highScore', Math.max(Save.get('highScore', 0), state.score));

        // Dispara partículas no local da coleta
        const fx = node.getNodeOrNull('%CollectBurstFX');
        if (fx) {
          fx.position = { x: c.position.x, y: 0.8, z: c.position.z };
          fx.emitBurst(24);
        }

        // Animação no jogador + Shake suave na câmera
        const pAnim = node.getNodeOrNull('%PlayerAnim');
        if (pAnim) {
          pAnim.play('collect_pop');
          pAnim.queue('idle_breath');
        }
        const cam = node.getNodeOrNull('%MainCamera');
        if (cam) cam.shake({ strength: 0.14, duration: 0.2 });

        // Reposiciona o cristal com Rng determinístico + Tween de escala
        const angle = state.rng.float(0, Math.PI * 2);
        const radius = state.rng.float(1.8, 4.6);
        c.position = { x: Math.cos(angle) * radius, y: 0.75, z: Math.sin(angle) * radius };
        c.scale.set(0.15, 0.15, 0.15);
        c.createTween().to(c.scale, { x: 1, y: 1, z: 1 }, 0.35, 'easeOutBack');

        node.emit('crystalCollected', state.collected, state.score);
        state.fsm.go('EXPLORANDO');
      }
    }

    // 6. Checar proximidade com o Drone Sentinela
    const drone = node.getNodeOrNull('%DroneSentinela');
    if (drone && state.invulnTimer <= 0) {
      const dp = drone.globalPosition;
      const distDrone = Math.hypot(dp.x - node.position.x, dp.z - node.position.z);
      if (distDrone < 0.95) {
        state.invulnTimer = 1.2;
        state.energy = Math.max(10, state.energy - 20);
        state.fsm.go('ALERTA_IMPACTO');
        const cam = node.getNodeOrNull('%MainCamera');
        if (cam) cam.shake({ strength: 0.28, duration: 0.32 });
      }
    }

    // 7. Sincronizar UI (HUD)
    const scoreLbl = node.getNodeOrNull('%ScoreLabel');
    if (scoreLbl) {
      scoreLbl.text = '💎 Cristais: ' + state.collected + '  |  🏆 Pontos: ' + state.score + '  (Recorde: ' + Save.get('highScore', state.score) + ')';
    }
    const energyBar = node.getNodeOrNull('%EnergyBar');
    if (energyBar) {
      energyBar.value = Math.round(state.energy);
    }
    const tagLbl = node.getNodeOrNull('%PlayerTagLabel');
    if (tagLbl) {
      tagLbl.text = 'Guardião [' + Math.round(state.energy) + '%]';
    }
  }
};
`.trim();

  playerCore.attachScript({
    name: 'PlayerController',
    code: gameScriptCode,
    enabled: true
  });

  root.add(playerCore);

  // ============================================================================
  // 7. TIMER DE ONDA DE BÔNUS (Timer Node)
  // ============================================================================
  const waveTimer = new Timer('WaveBonusTimer', {
    waitTime: 5.0,
    oneShot: false,
    autostart: true
  });
  root.add(waveTimer);

  // ============================================================================
  // 8. CAMADA DE INTERFACE DE USUÁRIO (UILayer + Panel + Label + ProgressBar + Button)
  // ============================================================================
  const uiLayer = new UILayer('HUDLayer', {
    layer: 1,
    scaleMode: 'scaleWithScreen',
    referenceResolution: { width: 1280, height: 720 },
    visible: true
  });

  const hudPanel = new Panel('PainelHUD', {
    anchor: 'topLeft',
    offset: { x: 16, y: 16 },
    size: { width: 420, height: 148 }
  });
  uiLayer.add(hudPanel);

  const titleLabel = new Label('TitleLabel', {
    text: '🔷 GUARDIÃO GEOMÉTRICO — ARENA DOS CRISTAIS',
    fontSize: 13,
    color: '#38bdf8'
  });
  hudPanel.add(titleLabel);

  const scoreLabel = new Label('ScoreLabel', {
    text: '💎 Cristais: 0  |  🏆 Pontos: 0',
    fontSize: 15,
    color: '#f8fafc'
  });
  scoreLabel.uniqueName = true;
  hudPanel.add(scoreLabel);

  const stateLabel = new Label('StateLabel', {
    text: 'Estado: EXPLORANDO (WASD / Setas ou Clique em um Cristal)',
    fontSize: 12,
    color: '#94a3b8'
  });
  stateLabel.uniqueName = true;
  hudPanel.add(stateLabel);

  const energyBar = new ProgressBar('EnergyBar', {
    min: 0,
    max: 100,
    value: 100,
    showPercentage: true,
    fillColor: '#10b981'
  });
  energyBar.uniqueName = true;
  hudPanel.add(energyBar);

  const pulseBtn = new Button('PulseButton', {
    text: '⚡ Pulso Magnético (Espaço)',
    actionId: 'pulse_collect'
  });
  pulseBtn.uniqueName = true;
  hudPanel.add(pulseBtn);

  const rerollBtn = new Button('ResetGameButton', {
    text: '🎲 Gerar Novo Mapa (RNG)',
    actionId: 'reroll_map'
  });
  rerollBtn.uniqueName = true;
  hudPanel.add(rerollBtn);

  // Rótulo flutuante ancorado diretamente ao PlayerCore 3D
  const playerTagLabel = new Label('PlayerTagLabel', {
    text: 'Guardião [100%]',
    fontSize: 12,
    color: '#a7f3d0'
  });
  playerTagLabel.uniqueName = true;
  playerTagLabel.anchorTo3D('PlayerCore', { x: 0, y: -38 });
  uiLayer.add(playerTagLabel);

  root.add(uiLayer);
  root.updateMatrixWorld(true);

  return root;
}
