import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as THREE from 'three';
import {
  EngineNode,
  Node,
  Node3D,
  DEFAULT_SCENE_ENVIRONMENT,
  Sprite3DNode,
  Sprite3D,
  RigidBody3DNode,
  RigidBody3D,
  CollisionShape3DNode,
  CollisionShape3D,
  Camera3D,
  Camera3DNode,
  DirectionalLight3D,
  PointLight3D,
  SpotLight3D,
  AmbientLight3D,
  HemisphereLight3D,
  Mesh3D,
  Label3D,
  Particles3D,
  Path3D,
  PathFollow3D,
  PickArea3D,
  Timer,
  AudioPlayer,
  AnimationPlayer,
  UILayer,
  Panel,
  Label,
  Button,
  CheckBox,
  Slider,
  ProgressBar,
  SceneTree,
  Tween,
  Easing,
  Rng,
  Shake,
  StateMachine,
  Save,
  Input,
  Log,
  ENGINE_ERROR_CODES,
  Material,
  CanvasTexture,
  Curve3D,
  AnimationClip,
  DataResource,
  ResourceRegistry,
  PhysicsServer,
  NodeFactory,
  EditorSceneManager,
  ScriptClassLoader,
  generateMinimalNodeScriptTemplate,
  createEditorGuidesGroup,
  setEditorAxisGuidesVisibility,
  pickSelectableNodeFromIntersects,
  createCameraNodeVisualHelper,
  createCameraFrustumHelper,
  syncCameraFrustumHelper,
  computeEditorCameraPresetPose,
  createGeometricMiniGameScene,
} from './index.js';
import {
  ProjectPathResolver,
  globalPathResolver,
  MAXROS_INSTALLATION_ROOT,
  ResourceUUIDRegistry,
  isValidUUID,
  ProjectValidator,
  ProjectCreator,
  ProjectLoader,
  ProjectManager,
} from '../editor/project-manager/index.js';

function assertVec3Close(actual, expected, tolerance = 1e-4, label = 'Vector3') {
  assert.ok(
    Math.abs(actual.x - expected.x) <= tolerance &&
      Math.abs(actual.y - expected.y) <= tolerance &&
      Math.abs(actual.z - expected.z) <= tolerance,
    `${label} mismatch: actual (${actual.x}, ${actual.y}, ${actual.z}) vs expected (${expected.x}, ${expected.y}, ${expected.z})`
  );
}

/**
 * Runs the comprehensive automated test suite for the Maxros Engine,
 * covering all core engine tests (1-17) plus the complete Maxros Engine
 * Project Manager, JSON standardization, dynamic project:// root, and UUID lifecycle tests (18-25).
 */
export function runArchitectureValidation() {
  const physics = PhysicsServer.getInstance();
  physics.clear();
  physics.setTimeScale(1.0);
  Tween.clearAll();
  Input.reset();
  Log.clear();

  const testResults = [];

  // TEST 1: Local <-> Global Transform Math under Translated, Rotated, and Scaled Parents
  const root = new EngineNode('RootScene');
  const parentZone = new EngineNode('ParentZone');
  parentZone.position = { x: 10, y: 5, z: -3 };
  parentZone.rotation.set(0, Math.PI / 2, 0); // 90 deg around Y
  parentZone.scale.set(2, 2, 2);

  const childMarker = new EngineNode('ChildMarker');
  childMarker.position = { x: 2, y: 3, z: 4 };

  root.add(parentZone);
  parentZone.add(childMarker);

  assertVec3Close(
    childMarker.position_global,
    { x: 18, y: 11, z: -7 },
    1e-4,
    'Cascaded global position under rotated+scaled parent'
  );

  childMarker.position_global = { x: 10, y: 15, z: -3 };
  assertVec3Close(
    childMarker.position_global,
    { x: 10, y: 15, z: -3 },
    1e-4,
    'Global position round-trip'
  );
  assertVec3Close(
    childMarker.position,
    { x: 0, y: 5, z: 0 },
    1e-4,
    'Local position after position_global setter'
  );
  testResults.push('Transform Math (Local <-> Global under Rotated/Scaled Parent): OK');

  // TEST 2: World-Preserving Reparenting (reparentPreservingWorldTransform)
  const secondParent = new EngineNode('SecondRotatedParent');
  secondParent.position = { x: -6, y: 2, z: 8 };
  secondParent.rotation.set(0.3, -0.7, 0.2);
  secondParent.scale.set(1.5, 1.5, 1.5);
  root.add(secondParent);

  const worldPosBefore = childMarker.position_global.clone();
  const worldQuatBefore = childMarker.quaternion_global.clone();

  const reparentedOk = childMarker.reparentPreservingWorldTransform(secondParent);
  assert.equal(reparentedOk, true, 'Reparenting to valid node should succeed');
  assertVec3Close(
    childMarker.position_global,
    worldPosBefore,
    1e-4,
    'World position preserved after reparenting to rotated/scaled parent'
  );

  const worldQuatAfter = childMarker.quaternion_global;
  assert.ok(
    Math.abs(worldQuatBefore.dot(worldQuatAfter)) > 0.9999,
    'World quaternion preserved after reparenting'
  );

  childMarker.reparentPreservingWorldTransform(root);
  assertVec3Close(
    childMarker.position_global,
    worldPosBefore,
    1e-4,
    'World position preserved after unparenting back to root'
  );
  testResults.push('Reparenting Preserving World Transform (Parent <-> Child <-> Root): OK');

  // TEST 3: Sprite3DNode, Editor Visibility/Lock Flags & Behavior Script Execution (Rotator & Oscillator)
  const spriteNode = new Sprite3DNode({
    name: 'HeroBillboard',
    texturePath: 'assets/textures/crate_albedo.png',
    renderMode: 'sprite',
    width: 2,
    height: 2,
  });
  spriteNode.setEditorVisible(false);
  spriteNode.setEditorLocked(true);
  assert.equal(spriteNode.visible, false, 'setEditorVisible(false) should hide THREE.Object3D');
  assert.equal(spriteNode.editorLocked, true, 'setEditorLocked(true) should lock node');

  spriteNode.components.push(
    {
      id: 'comp_rot_1',
      type: 'Rotator',
      enabled: true,
      params: { speedX: 0, speedY: 90, speedZ: 0 },
    },
    {
      id: 'comp_osc_1',
      type: 'Oscillator',
      enabled: true,
      params: { axis: 'y', amplitude: 2.0, frequency: 0.25 },
    }
  );
  parentZone.add(spriteNode);
  spriteNode.update(1.0);
  assert.ok(Math.abs(spriteNode.rotation.y - Math.PI / 2) < 1e-4, 'Rotator script should rotate node');
  assert.ok(Math.abs(spriteNode.position.y - 2.0) < 1e-4, 'Oscillator script should offset local Y by +2.0');

  const serializedSprite = spriteNode.serialize();
  assert.equal(serializedSprite.editorVisible, false);
  assert.equal(serializedSprite.editorLocked, true);
  assert.equal(serializedSprite.components.length, 2);
  testResults.push('Sprite3DNode, Visibility/Lock Flags & Behavior Scripts (Rotator/Oscillator): OK');

  // TEST 4: Multi-Body Mid-Collision Physics Stress & Deterministic Reset
  const floorBody = new RigidBody3DNode({
    name: 'StaticFloor',
    mass: 0,
    bodyType: 'static',
  });
  floorBody.position = { x: 0, y: 0, z: 0 };
  floorBody.add(
    new CollisionShape3DNode({
      name: 'FloorBoxCollider',
      shapeType: 'Box',
      size: { x: 20, y: 1, z: 20 },
    })
  );
  root.add(floorBody);

  const spawnedBodies = [];
  for (let i = 0; i < 12; i++) {
    const rb = new RigidBody3DNode({
      name: `ClusterBody_${i}`,
      mass: 1.5 + (i % 3),
      bodyType: 'dynamic',
    });
    rb.position = { x: (i % 3) * 0.4, y: 2.0 + i * 0.9, z: Math.floor(i / 3) * 0.4 };
    rb.add(
      new CollisionShape3DNode({
        name: `ClusterShape_${i}`,
        shapeType: i % 2 === 0 ? 'Box' : 'Sphere',
        size: { x: 0.8, y: 0.8, z: 0.8 },
        radius: 0.45,
      })
    );
    root.add(rb);
    spawnedBodies.push(rb);
  }

  assert.equal(physics.getBodyCount(), 13, 'PhysicsServer should track 1 floor + 12 dynamic bodies');

  const prePlaySnapshot = root.serialize();

  for (let stepIdx = 0; stepIdx < 45; stepIdx++) {
    physics.step(1 / 60);
  }

  physics.clear();
  assert.equal(physics.getBodyCount(), 0, 'PhysicsServer.clear() must remove all bodies and contacts');

  const restoredRoot = NodeFactory.createFromData(prePlaySnapshot, { physicsServer: physics });
  assert.equal(
    physics.getBodyCount(),
    13,
    'PhysicsServer must restore exact body count without duplicates after mid-collision reset'
  );

  const restoredBody0 = restoredRoot.children.find((n) => n.name === 'ClusterBody_0');
  assertVec3Close(
    restoredBody0.position_global,
    { x: 0, y: 2.0, z: 0 },
    1e-5,
    'Restored body must return to exact pre-play position'
  );
  assertVec3Close(
    restoredBody0.body.velocity,
    { x: 0, y: 0, z: 0 },
    1e-5,
    'Restored body must have zero residual velocity'
  );
  testResults.push('Multi-Body Mid-Collision Reset (13 Bodies): OK');

  // TEST 5: Subtree Duplication (Clone with New UUIDs) & Unknown Node Resilience
  const clonedData = NodeFactory.cloneSerializedSubtreeWithNewUuids(restoredBody0.serialize(), {
    nameSuffix: '_Duplicado',
    positionOffset: { x: 2, y: 0, z: 2 },
  });
  assert.notEqual(clonedData.uuid, restoredBody0.uuid, 'Cloned root must have a new UUID');
  assert.notEqual(
    clonedData.children[0].uuid,
    restoredBody0.children[0].uuid,
    'Cloned child collider must have a new UUID'
  );

  const warnings = [];
  const sceneWithUnknown = {
    type: 'EngineNode',
    name: 'SceneWithUnknownPluginNode',
    children: [
      {
        type: 'FutureShaderPortal3DNode',
        name: 'MysteryPortal',
        customShaderProp: 'nebula_v2',
        position: { x: 3, y: 4, z: 5 },
        children: [],
      },
    ],
  };
  const recoveredTree = NodeFactory.createFromData(sceneWithUnknown, {
    physicsServer: physics,
    strict: false,
    warnings,
  });
  assert.equal(warnings.length, 1, 'Unknown node type should emit 1 non-fatal warning');
  assert.equal(recoveredTree.children[0].position.x, 3);
  const reserializedUnknown = recoveredTree.serialize();
  assert.equal(
    reserializedUnknown.children[0].type,
    'FutureShaderPortal3DNode',
    'Unknown node type should preserve original type and custom attributes on re-serialization'
  );
  assert.equal(reserializedUnknown.children[0].customShaderProp, 'nebula_v2');
  testResults.push('Subtree Cloning & Unknown Node Resilience: OK');

  // TEST 6: Atomic Save & Load via EditorSceneManager
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-scene-test-'));
  const sceneFilePath = path.join(tempDir, 'test_level.scene');
  const tempSceneFilePath = EditorSceneManager.getTempFilePath(sceneFilePath);

  const sceneManager = new EditorSceneManager({ physicsServer: physics });
  const saveResult = sceneManager.saveScene(restoredRoot, sceneFilePath);

  assert.ok(fs.existsSync(saveResult.filePath), 'Final .scene file must exist on disk');
  assert.ok(!fs.existsSync(tempSceneFilePath), 'Temporary .tmp.scene file must not remain after atomic rename');

  const loadedFromDisk = sceneManager.loadScene(sceneFilePath, { clearPhysicsBeforeLoad: true });
  assert.equal(loadedFromDisk.uuid, restoredRoot.uuid);
  assert.equal(physics.getBodyCount(), 13);
  testResults.push('Atomic Disk Save & Load (.tmp.scene -> fs.renameSync): OK');

  // TEST 7: Saving and Loading a Scene Preserves Custom Environment Color
  const envSceneFilePath = path.join(tempDir, 'env_custom.scene');
  restoredRoot.setEnvironment({
    mode: 'solid_color',
    color: '#2a3b4c',
    skybox: null,
  });
  sceneManager.saveScene(restoredRoot, envSceneFilePath);
  const loadedWithEnv = sceneManager.loadScene(envSceneFilePath, { clearPhysicsBeforeLoad: true });
  assert.equal(loadedWithEnv.environment.mode, 'solid_color');
  assert.equal(loadedWithEnv.environment.color, '#2a3b4c');
  assert.equal(loadedWithEnv.environment.skybox, null);
  testResults.push('Scene Environment Save & Load Preserves Color (#2a3b4c): OK');

  // TEST 8: Legacy Scene Without Environment Field Loads Default Environment Cleanly
  const legacySceneDataWithoutEnv = {
    type: 'EngineNode',
    uuid: 'legacy-root-uuid-001',
    name: 'LegacySceneRoot',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
    scale: { x: 1, y: 1, z: 1 },
    children: [],
  };
  const legacyRoot = NodeFactory.createFromData(legacySceneDataWithoutEnv, {
    physicsServer: physics,
  });
  assert.deepEqual(legacyRoot.environment, DEFAULT_SCENE_ENVIRONMENT);
  testResults.push(
    `Legacy Scene Without Environment Fallback (${DEFAULT_SCENE_ENVIRONMENT.color}): OK`
  );

  // TEST 9: Editor Guides Never Appear in Scene Serialization (.scene)
  const sceneWithGuides = new EngineNode('SceneWithAttachedGuides');
  const childNode = new EngineNode('RealGameChildNode');
  sceneWithGuides.add(childNode);

  const guidesGroup = createEditorGuidesGroup({ size: 20, divisions: 20 });
  THREE.Object3D.prototype.add.call(sceneWithGuides, guidesGroup);

  const serializedWithGuides = sceneWithGuides.serialize();
  assert.equal(serializedWithGuides.children.length, 1);
  assert.equal(serializedWithGuides.children[0].name, 'RealGameChildNode');
  const serializedJsonString = JSON.stringify(serializedWithGuides);
  assert.ok(
    !serializedJsonString.includes('EditorVisualGuides') &&
      !serializedJsonString.includes('EditorGroundGrid') &&
      !serializedJsonString.includes('EditorAxis')
  );
  testResults.push('Editor Guides Excluded from .scene Serialization: OK');

  // TEST 10: Editor Guides Are Not Selectable and Do Not Block Raycast Selection
  const raycastStage = new THREE.Scene();
  const raycastGuides = createEditorGuidesGroup({ size: 20, divisions: 20 });
  raycastStage.add(raycastGuides);

  const raycastRoot = new EngineNode('RaycastSceneRoot');
  const selectableTarget = new EngineNode('SelectableTargetAtOrigin');
  const targetMesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  targetMesh.userData = { ownerNode: selectableTarget };
  THREE.Object3D.prototype.add.call(selectableTarget, targetMesh);
  raycastRoot.add(selectableTarget);
  raycastStage.add(raycastRoot);
  raycastStage.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(0, 5, 5),
    new THREE.Vector3(0, -1, -1).normalize()
  );

  const guideOnlyHits = raycaster.intersectObjects([raycastGuides], true);
  assert.equal(guideOnlyHits.length, 0);

  const combinedHits = [
    { object: raycastGuides.children[0] },
    { object: raycastGuides.children[1] },
    ...raycaster.intersectObjects(raycastStage.children, true),
  ];
  const pickedNode = pickSelectableNodeFromIntersects(combinedHits, raycastRoot);
  assert.equal(pickedNode, selectableTarget);
  const pickedFromGuidesOnly = pickSelectableNodeFromIntersects(
    [{ object: raycastGuides }, { object: raycastGuides.children[0] }],
    raycastRoot
  );
  assert.equal(pickedFromGuidesOnly, null);
  testResults.push('Editor Guides Non-Selectable & Non-Blocking in Raycast: OK');

  // ============================================================================
  // TEST 11: Node, Node3D, SceneTree, Paths (%UniqueName), Groups & Signals (Sections 2, 3, 4, 6)
  // ============================================================================
  assert.equal(Sprite3D, Sprite3DNode, 'Sprite3D alias must match Sprite3DNode');
  assert.equal(RigidBody3D, RigidBody3DNode, 'RigidBody3D alias must match RigidBody3DNode');
  assert.equal(CollisionShape3D, CollisionShape3DNode, 'CollisionShape3D alias must match CollisionShape3DNode');

  const treeRoot = new Node3D('Mundo');
  const hud = new Node('HUD');
  const placar = new Label('Placar', { text: '0' });
  placar.uniqueName = true;
  hud.addChild(placar);
  treeRoot.addChild(hud);

  const enemyA = new Node3D('Inimigo_Alpha');
  enemyA.addToGroup('inimigos');
  const enemyB = new Node3D('Inimigo_Beta');
  enemyB.addToGroup('inimigos');
  treeRoot.addChild(enemyA);
  treeRoot.addChild(enemyB);

  const sceneTree = new SceneTree(treeRoot);
  sceneTree.setNodeFactory(NodeFactory);

  assert.equal(enemyA.getNode('%Placar'), placar, '%UniqueName resolution across branches must work');
  assert.equal(enemyA.getNode('../Inimigo_Beta'), enemyB, 'Relative sibling path lookup must work');
  assert.equal(placar.getPath(), '/Mundo/HUD/Placar', 'getPath() must return full tree path');
  assert.equal(treeRoot.findChild('Inimigo_*').name, 'Inimigo_Alpha', 'findChild wildcard must match');
  assert.equal(sceneTree.getNodesInGroup('inimigos').length, 2, 'SceneTree group lookup must find 2 enemies');

  sceneTree.setGroupProperty('inimigos', 'processPriority', 7);
  assert.equal(enemyB.processPriority, 7, 'setGroupProperty must update all nodes in group');

  let signalPayload = null;
  enemyA.defineSignal('derrotado');
  enemyA.connect('derrotado', (pts) => {
    signalPayload = pts;
  });
  enemyA.emit('derrotado', 250);
  assert.equal(signalPayload, 250, 'Custom Signal connect & emit must pass payload');
  testResults.push('Node, Node3D, SceneTree, %UniqueName Paths, Groups & Signals: OK');

  // ============================================================================
  // TEST 12: 3D Scene Nodes (Mesh3D all 9 shapes, Camera3D, Light3D subclasses, Label3D, Particles3D, PickArea3D)
  // ============================================================================
  const shapes = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'torusKnot', 'plane', 'octahedron', 'icosahedron'];
  for (const sh of shapes) {
    const m = new Mesh3D(`Mesh_${sh}`, { shape: sh, color: '#10b981' });
    assert.equal(m.shape, sh);
    assert.ok(m._meshObj instanceof THREE.Mesh, `Mesh3D(${sh}) must create internal THREE.Mesh`);
  }

  const cam3D = new Camera3D('CamTeste', { current: true, fov: 60 });
  cam3D.position = { x: 0, y: 0, z: 10 };
  treeRoot.addChild(cam3D);
  const screenPt = cam3D.worldToScreen({ x: 0, y: 0, z: 0 }, { width: 800, height: 600 });
  assert.ok(Math.abs(screenPt.x - 400) < 1 && Math.abs(screenPt.y - 300) < 1, 'Camera3D.worldToScreen origin projection');

  const dirLight = new DirectionalLight3D('Sun');
  const ptLight = new PointLight3D('Bulb');
  const spotLight = new SpotLight3D('Spot');
  const ambLight = new AmbientLight3D('Amb');
  const hemiLight = new HemisphereLight3D('Hemi');
  assert.equal(dirLight.type, 'DirectionalLight3D');
  assert.equal(ptLight.type, 'PointLight3D');
  assert.equal(spotLight.type, 'SpotLight3D');
  assert.equal(ambLight.type, 'AmbientLight3D');
  assert.equal(hemiLight.type, 'HemisphereLight3D');

  const label3d = new Label3D('FloatingTitle', { text: 'Core3D' });
  assert.equal(label3d.text, 'Core3D');

  const particles = new Particles3D('Sparks', { oneShot: true, amount: 10, lifetime: 0.2 });
  particles.emitBurst(10);
  assert.equal(particles._particles.length, 10);
  particles._stepNodeInternal(0.25);
  assert.equal(particles._particles.length, 0, 'Particles3D must expire particles after lifetime');

  let pickClicked = false;
  const pickArea = new PickArea3D('Botao3D');
  pickArea.connect('clicked', () => { pickClicked = true; });
  pickArea.triggerClick({ button: 0 });
  assert.equal(pickClicked, true, 'PickArea3D must emit clicked signal');
  testResults.push('3D Nodes (Mesh3D 9 Shapes, Camera3D, Lights, Label3D, Particles3D, PickArea3D): OK');

  // ============================================================================
  // TEST 13: Path3D, Curve3D & PathFollow3D
  // ============================================================================
  const curve = new Curve3D([
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 0, z: 0 }
  ]);
  const pathNode = new Path3D('Rota', curve);
  const follower = new PathFollow3D('Vagao', { progress: 0, speed: 0.5, loop: false });
  pathNode.addChild(follower);
  follower.progress = 0.5;
  assertVec3Close(follower.position, { x: 5, y: 0, z: 0 }, 1e-4, 'PathFollow3D at progress 0.5');
  follower._stepNodeInternal(1.0);
  assertVec3Close(follower.position, { x: 10, y: 0, z: 0 }, 1e-4, 'PathFollow3D after stepping to end');
  testResults.push('Path3D, Curve3D & PathFollow3D Interpolation: OK');

  // ============================================================================
  // TEST 14: Timer, AnimationPlayer, Tween, Easing & Shake (Sections 8, 9, 11)
  // ============================================================================
  let timerFired = 0;
  const timer = new Timer('Countdown', { waitTime: 0.5, oneShot: true, autostart: true });
  timer.connect('timeout', () => { timerFired++; });
  timer._stepNodeInternal(0.6);
  assert.equal(timerFired, 1, 'Timer must emit timeout after waitTime');

  const animTarget = new Node3D('AnimTarget');
  const animPlayer = new AnimationPlayer('Anim', { rootNode: '..' });
  animTarget.addChild(animPlayer);
  animPlayer.addClip(
    new AnimationClip({
      name: 'slide',
      length: 1.0,
      loop: false,
      tracks: [
        {
          type: 'property',
          path: '.',
          property: 'position',
          easing: 'linear',
          keyframes: [
            { time: 0, value: { x: 0, y: 0, z: 0 } },
            { time: 1, value: { x: 20, y: 10, z: -5 } }
          ]
        }
      ]
    })
  );
  animPlayer.play('slide');
  animPlayer._stepNodeInternal(0.5);
  assertVec3Close(animTarget.position, { x: 10, y: 5, z: -2.5 }, 1e-3, 'AnimationPlayer keyframe midpoint');

  const tweenTarget = { val: 0 };
  const tw = new Tween().to(tweenTarget, { val: 100 }, 1.0, 'linear');
  tw.update(0.5);
  assert.ok(Math.abs(tweenTarget.val - 50) < 1e-3, 'Tween linear midpoint');
  tw.update(0.5);
  assert.ok(Math.abs(tweenTarget.val - 100) < 1e-3, 'Tween completion');

  const shakeNode = new Node3D('ShakeTarget');
  shakeNode.position = { x: 3, y: 4, z: 5 };
  Shake.play(shakeNode, { strength: 0.5, duration: 0.2, seed: 42 });
  Shake.updateAll(0.1);
  Shake.updateAll(0.15);
  assertVec3Close(shakeNode.position, { x: 3, y: 4, z: 5 }, 1e-4, 'Shake must restore exact original position on finish');
  testResults.push('Timer, AnimationPlayer, Tween, Easing & Shake: OK');

  // ============================================================================
  // TEST 15: Rng, StateMachine, Save, Input, Resources & Structured Error Codes (E101-E501)
  // ============================================================================
  const rng1 = new Rng('semente-fixa');
  const rng2 = new Rng('semente-fixa');
  const seq1 = [rng1.int(1, 100), rng1.float(0, 10), rng1.chance(0.5)];
  const seq2 = [rng2.int(1, 100), rng2.float(0, 10), rng2.chance(0.5)];
  assert.deepEqual(seq1, seq2, 'Rng with identical seed must produce identical sequence');

  const fsm = new StateMachine({
    initial: 'idle',
    states: {
      idle: { allowedTransitions: ['run'] },
      run: { allowedTransitions: ['idle'] }
    }
  });
  assert.equal(fsm.current, 'idle');
  assert.equal(fsm.go('run'), true);
  assert.equal(fsm.current, 'run');
  assert.equal(fsm.previous, 'idle');

  Save.slot('test_slot').set('coins', 77);
  assert.equal(Save.get('coins'), 77, 'Save.set/get must persist value');

  Input.feedKeyDown('KeyW');
  assert.equal(Input.isPressed('move_up'), true, 'Input action move_up must respond to KeyW');
  assert.equal(Input.isJustPressed('move_up'), true);
  Input.stepFrame();
  assert.equal(Input.isJustPressed('move_up'), false);
  Input.reset();

  const canvasTex = new CanvasTexture(64, 64);
  canvasTex.draw((ctx) => {
    ctx.clear('#000000').rect(0, 0, 32, 32, { fill: '#ffffff' }).circle(32, 32, 10, { fill: '#10b981' });
  });
  assert.equal(canvasTex.canvas.commands.length, 3, 'Canvas2D drawing commands recorded');

  const dataRes = new DataResource({ hp: 'number' }, { hp: 100 });
  assert.equal(dataRes.validate(), true);
  ResourceRegistry.register('res://hero_stats', dataRes);
  assert.equal(ResourceRegistry.get('res://hero_stats'), dataRes);

  // Validate error code logging (E101, E102, E501)
  Log.clear();
  treeRoot.getNode('Caminho/Inexistente');
  treeRoot.addChild(treeRoot);
  treeRoot.emit('sinalNaoDeclarado');
  const loggedCodes = Log.getEntries().map((e) => e.code);
  assert.ok(loggedCodes.includes('E101'), 'Must log E101 on missing node path');
  assert.ok(loggedCodes.includes('E102'), 'Must log E102 on hierarchy cycle');
  assert.ok(loggedCodes.includes('E501'), 'Must log E501 on undeclared signal');
  assert.ok(Object.keys(ENGINE_ERROR_CODES).length >= 9, 'All error codes E101-E501 defined');
  testResults.push('Rng, StateMachine, Save, Input, Canvas2D & Error Codes (E101-E501): OK');

  // ============================================================================
  // TEST 16: UILayer & Control Subclasses (Panel, Label, Button, CheckBox, Slider, ProgressBar, anchorTo3D)
  // ============================================================================
  const ui = new UILayer('Interface');
  const panel = new Panel('Painel');
  const lbl = new Label('Texto', { text: 'Olá' });
  const btn = new Button('Botao', { text: 'Confirmar' });
  const chk = new CheckBox('Opcao', { checked: false });
  const sld = new Slider('Volume', { min: 0, max: 100, value: 40 });
  const prog = new ProgressBar('Vida', { value: 85 });

  let btnPressed = false;
  btn.connect('pressed', () => { btnPressed = true; });
  btn.press();
  assert.equal(btnPressed, true);

  chk.toggle();
  assert.equal(chk.checked, true);
  sld.setValue(90);
  assert.equal(sld.value, 90);
  lbl.anchorTo3D(enemyA, { x: 0, y: -20 });
  assert.equal(lbl._anchored3DTarget, 'Inimigo_Alpha');

  panel.addChild(lbl);
  panel.addChild(btn);
  panel.addChild(chk);
  panel.addChild(sld);
  panel.addChild(prog);
  ui.addChild(panel);
  testResults.push('UILayer & Control Subclasses (Panel, Label, Button, CheckBox, Slider, ProgressBar): OK');

  // ============================================================================
  // TEST 17: Playable Geometric Mini-Game End-to-End Validation (Map, UI, Animations, Nodes & Script)
  // ============================================================================
  const miniGameRoot = createGeometricMiniGameScene();
  const miniGameTree = new SceneTree(miniGameRoot);
  miniGameTree.setNodeFactory(NodeFactory);
  miniGameTree.isPlaying = true;

  const playerNode = miniGameRoot.getNode('%PlayerCore');
  const scoreLabel = miniGameRoot.getNode('%ScoreLabel');
  const energyBar = miniGameRoot.getNode('%EnergyBar');
  const crystals = miniGameTree.getNodesInGroup('cristais');
  const drone = miniGameRoot.getNode('%DroneSentinela');

  assert.ok(playerNode instanceof Mesh3D, 'Mini-game PlayerCore must be a Mesh3D');
  assert.equal(crystals.length, 3, 'Mini-game must have 3 geometric collectible crystals');
  assert.ok(drone instanceof Mesh3D, 'Mini-game must have a patrolling geometric SentinelDrone');
  assert.ok(scoreLabel instanceof Label, 'Mini-game must have %ScoreLabel in UILayer');
  assert.ok(energyBar instanceof ProgressBar, 'Mini-game must have %EnergyBar in UILayer');

  // Step 1 frame to trigger onReady in PlayerController script
  miniGameTree.step(1 / 60);
  assert.equal(playerNode.userData.scriptState.score, 0, 'Initial mini-game score must be 0');

  // Move first crystal right next to player and step to trigger collection, particle burst, animation & score update
  crystals[0].position = { x: playerNode.position.x + 0.2, y: 0.75, z: playerNode.position.z + 0.2 };
  miniGameTree.step(1 / 60);

  assert.equal(playerNode.userData.scriptState.collected, 1, 'Player must collect nearby geometric crystal');
  assert.equal(playerNode.userData.scriptState.score, 100, 'Collecting crystal must award 100 points');
  assert.ok(scoreLabel.text.includes('100'), 'UILayer ScoreLabel must update automatically');

  // Verify keyboard movement via Input service
  const startX = playerNode.position.x;
  Input.feedKeyDown('KeyD');
  for (let i = 0; i < 10; i++) {
    miniGameTree.step(1 / 60);
  }
  Input.reset();
  assert.ok(playerNode.position.x > startX, 'PlayerCore must move right when KeyD (move_right) is pressed');

  // Verify full .scene serialization & deserialization of the Geometric Mini-Game
  const serializedMiniGame = miniGameRoot.serialize();
  const reconstructedMiniGame = NodeFactory.createFromData(serializedMiniGame, { physicsServer: physics });
  assert.ok(reconstructedMiniGame.getNodeOrNull('%PlayerCore') instanceof Mesh3D, 'Reconstructed mini-game must preserve %PlayerCore');
  assert.ok(reconstructedMiniGame.getNodeOrNull('%ScoreLabel') instanceof Label, 'Reconstructed mini-game must preserve UILayer %ScoreLabel');
  testResults.push('Playable Geometric Mini-Game (3D Map, UI HUD, Animations, PathFollow & Scripts): OK');

  // ============================================================================
  // TEST 18: Maxros Engine Project Creation, maxros.project.json, Reproducible Core Runtime & 3 Templates
  // ============================================================================
  const pmWorkspaceDir = path.join(tempDir, 'maxros-pm-workspace');
  const pmStorageDir = path.join(tempDir, 'maxros-pm-storage');
  const testPM = new ProjectManager({
    projectsRootDir: pmWorkspaceDir,
    storageDir: pmStorageDir,
    autoProvisionDemo: true,
  });

  // 18.1 Official Demo is pre-installed in demoProjects, NEVER in recentProjects
  const initialOverview = testPM.getOverview();
  assert.equal(initialOverview.demoProjects.length, 1, 'Official Geometric Demo must be pre-installed in demoProjects');
  assert.equal(initialOverview.demoProjects[0].type, 'demo', 'Official Demo must have type === "demo"');
  assert.equal(initialOverview.recentProjects.length, 0, 'Pre-installed demo must NOT be injected into recentProjects');

  // 18.2 Create Project with Standard 3D Scene template (default)
  const createStdRes = testPM.createProject({
    name: 'Meu Jogo Espacial',
    folderName: 'meu-jogo-espacial',
    template: 'standard_3d',
    openAfterCreate: true,
  });
  assert.equal(createStdRes.success, true, 'Standard 3D project creation must succeed');
  assert.ok(isValidUUID(createStdRes.projectUuid), 'Project must have a valid UUID v4');
  assert.ok(isValidUUID(createStdRes.mainSceneUuid), 'Main scene must have a valid UUID v4');

  // Validate maxros.project.json via JSON.parse
  const stdManifestRaw = fs.readFileSync(createStdRes.manifestPath, 'utf-8');
  const stdManifest = JSON.parse(stdManifestRaw);
  assert.equal(stdManifest.engine, 'Maxros Engine');
  assert.equal(stdManifest.name, 'Meu Jogo Espacial');
  assert.equal(stdManifest.type, 'user');
  assert.equal(stdManifest.main_scene.uuid, createStdRes.mainSceneUuid);

  // Validate reproducible core/ runtime with version.json, package.json & package-lock.json
  assert.ok(fs.existsSync(path.join(createStdRes.projectPath, 'core', 'version.json')), 'core/version.json must exist');
  assert.ok(fs.existsSync(path.join(createStdRes.projectPath, 'core', 'runtime', 'package.json')), 'core/runtime/package.json must exist');
  assert.ok(fs.existsSync(path.join(createStdRes.projectPath, 'core', 'runtime', 'package-lock.json')), 'core/runtime/package-lock.json must exist');
  assert.ok(fs.existsSync(path.join(createStdRes.projectPath, 'core', 'runtime', 'runtime.js')), 'core/runtime/runtime.js must exist');
  assert.ok(!fs.existsSync(path.join(createStdRes.projectPath, 'core', 'engine', 'validate.js')), 'Dev-only validate.js must NOT be copied to project core/');

  // 18.3 Create Project with Empty Scene template
  const createEmptyRes = ProjectCreator.createProject({
    name: 'Projeto Vazio',
    folderName: 'projeto-vazio',
    baseDir: pmWorkspaceDir,
    template: 'empty',
  });
  assert.equal(createEmptyRes.success, true);
  const emptySceneJson = JSON.parse(
    fs.readFileSync(path.join(createEmptyRes.projectPath, 'scenes', 'main.scene.json'), 'utf-8')
  );
  assert.equal(emptySceneJson.rootNodes[0].children.length, 0, 'Empty template must have 0 pre-created children');
  testResults.push('Maxros Project Creation, maxros.project.json, Reproducible Core Lockfile & 3 Templates: OK');

  // ============================================================================
  // TEST 19: Dynamic Project Root (`project://`) Switching & Security Isolation
  // ============================================================================
  const prevGlobalRoot = globalPathResolver.getProjectRoot();

  // Open Project A (Meu Jogo Espacial)
  const openARes = testPM.openProject(createStdRes.projectPath);
  assert.equal(openARes.success, true);
  assert.equal(globalPathResolver.getProjectRoot(), createStdRes.projectPath, 'project:// must point to Project A root');
  assert.notEqual(globalPathResolver.getProjectRoot(), MAXROS_INSTALLATION_ROOT, 'project:// must NEVER point to Maxros installation root');
  assert.notEqual(globalPathResolver.getProjectRoot(), pmWorkspaceDir, 'project:// must NEVER point to general projects/ parent dir');
  assert.equal(
    globalPathResolver.resolvePath('project://scenes/main.scene.json'),
    path.join(createStdRes.projectPath, 'scenes', 'main.scene.json')
  );

  // Create & Open Project B (Outro Jogo) -> project:// must immediately switch to Project B
  const createBRes = testPM.createProject({
    name: 'Outro Jogo',
    folderName: 'outro-jogo',
    template: 'geometric_demo',
    openAfterCreate: true,
  });
  assert.equal(createBRes.success, true);
  assert.equal(globalPathResolver.getProjectRoot(), createBRes.projectPath, 'project:// must immediately switch to Project B root');
  assert.notEqual(createBRes.projectUuid, initialOverview.demoProjects[0].uuid, 'Cloned demo template must have a brand new project UUID');
  assert.equal(createBRes.manifest.type, 'user', 'Cloned demo template must be a "user" project, not "demo"');

  // Verify path traversal outside project:// is blocked
  const isolatedResolver = new ProjectPathResolver(createStdRes.projectPath);
  assert.throws(
    () => isolatedResolver.resolvePath('project://../../outside_secret.json'),
    /Acesso negado/,
    'Path traversal outside project:// must be blocked'
  );
  testResults.push('Dynamic Project Root (project://) Switching & Path Traversal Protection: OK');

  // ============================================================================
  // TEST 20: Selective `.uuid` Sidecars & Standardized File Extensions
  // ============================================================================
  const regA = new ResourceUUIDRegistry(createStdRes.projectPath);
  regA.scanProject({ autoRegisterUntracked: true });

  // Eligible project resources MUST have .uuid sidecars
  assert.ok(
    fs.existsSync(path.join(createStdRes.projectPath, 'scenes', 'main.scene.json.uuid')),
    'scenes/main.scene.json MUST have a .uuid sidecar'
  );
  assert.ok(
    fs.existsSync(path.join(createStdRes.projectPath, 'scripts', 'main.script.js.uuid')),
    'scripts/main.script.js MUST have a .uuid sidecar'
  );
  assert.ok(
    fs.existsSync(path.join(createStdRes.projectPath, 'resources', 'default_floor.material.json.uuid')),
    'resources/default_floor.material.json MUST have a .uuid sidecar'
  );
  assert.ok(
    fs.existsSync(path.join(createStdRes.projectPath, 'resources', 'default.input.json.uuid')),
    'resources/default.input.json MUST have a .uuid sidecar'
  );

  // Excluded technical files MUST NOT have .uuid sidecars (Refinement #1)
  assert.ok(
    !fs.existsSync(path.join(createStdRes.projectPath, 'maxros.project.json.uuid')),
    'maxros.project.json MUST NOT have a .uuid sidecar'
  );
  assert.ok(
    !fs.existsSync(path.join(createStdRes.projectPath, 'core', 'version.json.uuid')),
    'Files inside core/ MUST NOT have .uuid sidecars'
  );
  assert.ok(
    !fs.existsSync(path.join(createStdRes.projectPath, '.maxros', 'metadata', 'uuid_registry.json.uuid')),
    'Files inside .maxros/ MUST NOT have .uuid sidecars'
  );
  assert.ok(
    !fs.existsSync(path.join(createStdRes.projectPath, 'scenes', 'main.scene.json.uuid.uuid')),
    '.uuid files themselves MUST NOT have .uuid sidecars'
  );
  testResults.push('Selective .uuid Sidecar Rule (Resources Eligible vs core/, .maxros/, manifest Excluded): OK');

  // ============================================================================
  // TEST 21: UUID Lifecycle (Edit, Rename, Move Across Directories, Delete & Recreate)
  // ============================================================================
  const createdScript = regA.createResourceFile(
    'scripts/player.script.js',
    '// Versao 1\nreturn { onReady(node) { node.meta.v = 1; } };\n'
  );
  const originalScriptUuid = createdScript.uuid;
  assert.ok(isValidUUID(originalScriptUuid));

  // 21.1 Editing content preserves the exact UUID
  regA.updateResourceContent(
    'scripts/player.script.js',
    '// Versao 2 editada\nreturn { onReady(node) { node.meta.v = 2; } };\n'
  );
  assert.equal(
    regA.getUUIDForPath('scripts/player.script.js'),
    originalScriptUuid,
    'Editing file content MUST preserve the exact UUID'
  );

  // 21.2 Renaming & Moving to a subdirectory preserves the exact UUID and moves the .uuid sidecar
  const moveRes = regA.moveResourceFile(
    'scripts/player.script.js',
    'scripts/characters/hero_player.script.js'
  );
  assert.equal(moveRes.uuid, originalScriptUuid, 'Moving/renaming file MUST preserve its UUID');
  assert.ok(
    !fs.existsSync(path.join(createStdRes.projectPath, 'scripts', 'player.script.js.uuid')),
    'Old .uuid sidecar must be moved from old location'
  );
  assert.ok(
    fs.existsSync(path.join(createStdRes.projectPath, 'scripts', 'characters', 'hero_player.script.js.uuid')),
    'New .uuid sidecar must exist at new location'
  );
  assert.equal(
    regA.resolveUUID(originalScriptUuid)?.relativePath,
    'scripts/characters/hero_player.script.js',
    'UUID lookup must resolve to the new moved relative path'
  );

  // 21.3 Deleting removes both file and .uuid sidecar; recreating generates a NEW UUID
  regA.deleteResourceFile('scripts/characters/hero_player.script.js');
  assert.ok(
    !fs.existsSync(path.join(createStdRes.projectPath, 'scripts', 'characters', 'hero_player.script.js.uuid')),
    'Deleting resource must remove its .uuid sidecar'
  );
  const recreatedScript = regA.createResourceFile(
    'scripts/characters/hero_player.script.js',
    '// Recriado do zero\n'
  );
  assert.notEqual(
    recreatedScript.uuid,
    originalScriptUuid,
    'Deleting and recreating a file with the same name MUST generate a brand new UUID'
  );
  testResults.push('UUID Lifecycle (Edit, Rename, Move Across Directories, Delete & Recreate): OK');

  // ============================================================================
  // TEST 22: UUID References Survival After Moving Main Scene & Linked Scripts
  // ============================================================================
  // Move the main scene of Project A from scenes/main.scene.json to scenes/levels/level_01.scene.json
  const mainSceneUuidA = createStdRes.mainSceneUuid;
  regA.moveResourceFile('scenes/main.scene.json', 'scenes/levels/level_01.scene.json');

  // Move main.script.js to scripts/core_logic/main_controller.script.js
  regA.moveResourceFile('scripts/main.script.js', 'scripts/core_logic/main_controller.script.js');

  // Reopen Project A -> main_scene.uuid in maxros.project.json must locate scenes/levels/level_01.scene.json!
  const reopenMovedRes = testPM.openProject(createStdRes.projectPath);
  assert.equal(reopenMovedRes.success, true, 'Project must open seamlessly after moving main.scene.json because main_scene uses UUID');
  assert.equal(
    reopenMovedRes.projectContext.mainScenePath,
    'scenes/levels/level_01.scene.json',
    'Resolved mainScenePath must reflect the new moved location'
  );
  assert.equal(
    reopenMovedRes.projectContext.uuidDiagnostics.brokenSceneReferences.length,
    0,
    'Moved script referenced by UUID in scene must have 0 broken references'
  );
  testResults.push('UUID Reference Survival After Moving Main Scene & Linked Scripts: OK');

  // ============================================================================
  // TEST 23: Missing Sidecar Recovery & Non-Silent Duplicate UUID Conflict Handling
  // ============================================================================
  // 23.1 Delete a .uuid sidecar manually and verify detection + recovery of previous UUID
  const matRelPath = 'resources/default_floor.material.json';
  const originalMatUuid = regA.getUUIDForPath(matRelPath);
  assert.ok(isValidUUID(originalMatUuid));
  fs.unlinkSync(path.join(createStdRes.projectPath, `${matRelPath}.uuid`));

  const diagMissing = regA.scanProject({ autoRegisterUntracked: false });
  assert.equal(diagMissing.missingSidecars.length, 1, 'Missing .uuid sidecar must be detected');
  assert.equal(diagMissing.missingSidecars[0].relativePath, matRelPath);
  assert.equal(
    diagMissing.missingSidecars[0].recoveredUuid,
    originalMatUuid,
    'Registry cache must identify the previous UUID for recovery'
  );

  const recResult = regA.recoverMissingSidecar(matRelPath);
  assert.equal(recResult.success, true);
  assert.equal(recResult.uuid, originalMatUuid, 'Recovered sidecar must restore the exact original UUID');
  assert.equal(recResult.wasRecoveredFromHistory, true);

  // 23.2 Force a duplicate UUID between two files and verify non-silent conflict detection & resolution
  const extraMat = regA.createResourceFile(
    'resources/copied_floor.material.json',
    JSON.stringify({ type: 'StandardMaterial3D', albedoColor: '#ff0000' }, null, 2)
  );
  // Manually overwrite copied_floor.material.json.uuid with originalMatUuid to simulate external copy collision
  fs.writeFileSync(
    path.join(createStdRes.projectPath, 'resources', 'copied_floor.material.json.uuid'),
    `${originalMatUuid}\n`,
    'utf-8'
  );

  const diagConflict = regA.scanProject({ autoRegisterUntracked: false });
  assert.equal(diagConflict.duplicateConflicts.length, 1, 'Duplicate UUID conflict must be detected without silent overwrite');
  assert.equal(diagConflict.duplicateConflicts[0].uuid, originalMatUuid);
  assert.equal(
    diagConflict.duplicateConflicts[0].originalOwnerCandidate,
    matRelPath,
    'Conflict analyzer must identify the original owner from registry history/references'
  );

  // Resolve conflict explicitly keeping original owner
  const resolvedConflict = regA.resolveDuplicateConflict(originalMatUuid, matRelPath);
  assert.equal(resolvedConflict.success, true);
  assert.equal(regA.getUUIDForPath(matRelPath), originalMatUuid, 'Original file keeps its UUID');
  const reassignedUuid = regA.getUUIDForPath('resources/copied_floor.material.json');
  assert.ok(isValidUUID(reassignedUuid) && reassignedUuid !== originalMatUuid, 'Conflicting copy receives a new valid UUID upon explicit resolution');
  assert.equal(extrasConflictCheck(regA), 0, 'Zero duplicate conflicts remain after resolution');
  testResults.push('Missing .uuid Sidecar Recovery & Non-Silent Duplicate UUID Conflict Resolution: OK');

  // ============================================================================
  // TEST 24: .maxros/ Deletion Resilience & Regeneration Without Data Loss
  // ============================================================================
  fs.rmSync(path.join(createStdRes.projectPath, '.maxros'), { recursive: true, force: true });
  assert.ok(!fs.existsSync(path.join(createStdRes.projectPath, '.maxros')), '.maxros/ removed before test');

  const reopenAfterDotMaxrosDelete = testPM.openProject(createStdRes.projectPath);
  assert.equal(reopenAfterDotMaxrosDelete.success, true, 'Project must open cleanly even if .maxros/ was deleted');
  assert.ok(
    fs.existsSync(path.join(createStdRes.projectPath, '.maxros', 'metadata', 'uuid_registry.json')),
    '.maxros/metadata/uuid_registry.json must be regenerated automatically'
  );
  assert.equal(
    reopenAfterDotMaxrosDelete.projectContext.mainSceneUuid,
    mainSceneUuidA,
    'Main scene UUID and project resources must remain intact after .maxros/ regeneration'
  );
  testResults.push('.maxros/ Internal Cache Deletion Resilience & Auto-Regeneration: OK');

  // ============================================================================
  // TEST 25: Safe Non-Destructive Legacy Project Migration (project.core3d / .core3d / .scene -> maxros.project.json / .scene.json)
  // ============================================================================
  const legacyProjDir = path.join(tempDir, 'legacy-core3d-proj');
  fs.mkdirSync(path.join(legacyProjDir, '.core3d'), { recursive: true });
  fs.mkdirSync(path.join(legacyProjDir, 'scenes'), { recursive: true });
  fs.writeFileSync(
    path.join(legacyProjDir, 'project.core3d'),
    JSON.stringify({
      engine: 'Core3D Studio',
      name: 'Jogo Antigo Core3D',
      mainScene: 'scenes/arena_antiga.scene',
    }),
    'utf-8'
  );
  fs.writeFileSync(
    path.join(legacyProjDir, 'scenes', 'arena_antiga.scene'),
    JSON.stringify({
      type: 'EngineNode',
      name: 'LegacyArenaRoot',
      children: [{ type: 'Mesh3D', name: 'CuboAntigo', shape: 'box' }],
    }),
    'utf-8'
  );

  const preMigrationVal = ProjectValidator.validateProject(legacyProjDir);
  assert.equal(preMigrationVal.valid, false);
  assert.equal(preMigrationVal.legacyDetected, true, 'Validator must detect legacy project.core3d and .scene');

  const migratedOpen = testPM.openProject(legacyProjDir, { autoMigrateLegacy: true });
  assert.equal(migratedOpen.success, true, 'Legacy project must migrate and open cleanly');
  assert.ok(fs.existsSync(path.join(legacyProjDir, 'maxros.project.json')), 'maxros.project.json must be created');
  assert.ok(fs.existsSync(path.join(legacyProjDir, 'scenes', 'arena_antiga.scene.json')), 'arena_antiga.scene.json must be created');
  assert.ok(fs.existsSync(path.join(legacyProjDir, 'scenes', 'arena_antiga.scene.json.uuid')), 'arena_antiga.scene.json.uuid sidecar must be created');
  assert.ok(fs.existsSync(path.join(legacyProjDir, 'scenes', 'arena_antiga.scene')), 'Original .scene file must be preserved non-destructively');
  assert.equal(migratedOpen.projectContext.projectName, 'Jogo Antigo Core3D');
  testResults.push('Safe Non-Destructive Legacy Project Migration (project.core3d/.scene -> maxros.project.json/.scene.json): OK');

  // ============================================================================
  // TEST 26: Camera3DNode Visualization, Direction Lines, CameraHelper Frustum & Editor Camera Presets
  // ============================================================================
  assert.equal(Camera3DNode, Camera3D, 'Camera3DNode must be an alias for Camera3D');
  const camTestScene = new EngineNode('CamTestRoot');
  const camNode = new Camera3DNode('TestCam', {
    projection: 'perspective',
    fov: 75,
    aspect: 1.5,
    near: 0.25,
    far: 60,
    current: true,
  });
  camNode.position = { x: 2, y: 4, z: 8 };
  camTestScene.add(camNode);

  // Attach visual helper (3D chassis + icon sprite + -Z direction ray + arrowhead + near frame + UP indicator)
  const camVisualHelper = createCameraNodeVisualHelper(camNode, true);
  assert.equal(camVisualHelper.userData.isViewportHelper, true, 'Camera visual helper must be marked isViewportHelper');
  assert.ok(camVisualHelper.children.length >= 6, 'Camera visual helper must include chassis, lens, icon, -Z direction line, arrowhead, and UP triangle');
  camNode.add(camVisualHelper);

  // Verify THREE.CameraHelper frustum creation and dynamic update
  const frustumBundle = createCameraFrustumHelper(camNode);
  assert.ok(frustumBundle && frustumBundle.helper instanceof THREE.CameraHelper, 'createCameraFrustumHelper must return a THREE.CameraHelper');
  assert.equal(frustumBundle.helper.userData.isViewportHelper, true, 'CameraHelper must be marked isViewportHelper');
  assert.equal(frustumBundle.helper.userData.isEditorGuide, true, 'CameraHelper must be marked isEditorGuide so it never blocks raycasting');

  // Change FOV, Near, Far and verify syncCameraFrustumHelper updates the underlying camera and helper
  camNode.fov = 90;
  camNode.near = 0.5;
  camNode.far = 120;
  camNode._buildThreeCamera(camNode.aspect);
  const syncedOk = syncCameraFrustumHelper(camNode, frustumBundle);
  assert.equal(syncedOk, true, 'syncCameraFrustumHelper must return true when camera instance matches');
  assert.equal(camNode.threeCamera.fov, 90);
  assert.equal(camNode.threeCamera.near, 0.5);
  assert.equal(camNode.threeCamera.far, 120);

  // Verify Camera visual helpers NEVER pollute .scene.json serialization
  const serializedCamScene = camTestScene.serialize();
  assert.equal(serializedCamScene.children.length, 1, 'Serialized scene must contain only the Camera3D node');
  assert.equal(serializedCamScene.children[0].children.length, 0, 'Camera visual helper and direction lines must never be serialized into .scene.json');
  assert.equal(serializedCamScene.children[0].camera.fov, 90);
  assert.equal(serializedCamScene.children[0].camera.aspect, 1.5);
  assert.equal(serializedCamScene.children[0].camera.near, 0.5);
  assert.equal(serializedCamScene.children[0].camera.far, 120);

  // Verify Editor Camera Quick Alignment Presets (Top, Bottom, Left, Right, Front, Back)
  const centerZero = new THREE.Vector3(0, 0, 0);
  const topPose = computeEditorCameraPresetPose('top', centerZero, 10);
  assert.ok(topPose.position.y > 9.9, 'Top preset must place camera on Y+ looking down');
  const bottomPose = computeEditorCameraPresetPose('bottom', centerZero, 10);
  assert.ok(bottomPose.position.y < -9.9, 'Bottom preset must place camera on Y- looking up');
  const leftPose = computeEditorCameraPresetPose('left', centerZero, 10);
  assert.ok(leftPose.position.x < -9.9, 'Left preset must place camera on X- looking right');
  const rightPose = computeEditorCameraPresetPose('right', centerZero, 10);
  assert.ok(rightPose.position.x > 9.9, 'Right preset must place camera on X+ looking left');
  const frontPose = computeEditorCameraPresetPose('front', centerZero, 10);
  assert.ok(frontPose.position.z > 9.9, 'Front preset must place camera on Z+ looking back');
  const backPose = computeEditorCameraPresetPose('back', centerZero, 10);
  assert.ok(backPose.position.z < -9.9, 'Back preset must place camera on Z- looking forward');
  testResults.push('Camera3DNode Icon & Direction Lines, THREE.CameraHelper Frustum & Editor Camera Presets: OK');

  // ============================================================================
  // TEST 27: Separated CollisionShape3D (Box, Sphere, Cylinder, Trimesh/MeshCollider) & Unified Node Physics Migration
  // ============================================================================
  const meshParent = new Mesh3D('CrystalModel3D', {
    shape: 'octahedron',
    color: '#06b6d4',
  });
  meshParent.position = { x: 0, y: 4, z: 0 };

  const trimeshCollider = new CollisionShape3DNode('CrystalTrimeshCollider', {
    shapeType: 'Trimesh',
    trimeshSourceShape: 'auto',
  });
  meshParent.add(trimeshCollider);

  const trimeshCannonShape = trimeshCollider.createCannonShape();
  assert.ok(
    trimeshCannonShape && trimeshCannonShape.vertices && trimeshCannonShape.vertices.length >= 18,
    'Trimesh CollisionShape3DNode must build a CANNON.Trimesh from the parent Mesh3D 3D model geometry'
  );

  const cylCollider = new CollisionShape3DNode('PillarCylinderCollider', {
    shapeType: 'Cylinder',
    radius: 0.75,
    height: 2.4,
  });
  const cylCannonShape = cylCollider.createCannonShape();
  assert.ok(cylCannonShape, 'Cylinder CollisionShape3DNode must build a valid CANNON.Cylinder');

  // Verify legacy PhysicsScript data in `components` is automatically migrated into unified Node physics
  const legacyScenePayload = {
    ...meshParent.serialize(),
    components: [
      {
        id: 'legacy_phys_1',
        type: 'Physics',
        enabled: true,
        params: { bodyType: 'dynamic', mass: 2.0, gravityY: -9.82, restitution: 0.4, floorY: 0.5 },
      },
      {
        id: 'rot_comp_1',
        type: 'Rotator',
        enabled: true,
        params: { speedX: 0, speedY: 90, speedZ: 0 },
      },
    ],
  };
  const reconstructedMeshWithTrimesh = NodeFactory.deserialize(legacyScenePayload);
  const reconstructedCollider = reconstructedMeshWithTrimesh.getNode('CrystalTrimeshCollider');
  assert.ok(reconstructedCollider, 'Reconstructed Mesh3D must contain CrystalTrimeshCollider child');
  assert.equal(reconstructedCollider.shapeType, 'Trimesh');
  assert.equal(reconstructedCollider.trimeshSourceShape, 'auto');
  assert.equal(
    reconstructedMeshWithTrimesh.physicsMode,
    'dynamic',
    'Legacy PhysicsScript component must migrate into native physicsMode="dynamic"'
  );
  assert.equal(
    reconstructedMeshWithTrimesh.components.some((c) => c.type === 'Physics'),
    false,
    'Legacy PhysicsScript must be removed from components after migration to native Node physics'
  );
  assert.equal(
    reconstructedMeshWithTrimesh.components.some((c) => c.type === 'Rotator'),
    true,
    'Rotator component must remain intact and compatible with unified lifecycle'
  );

  const startY = reconstructedMeshWithTrimesh.position.y;
  reconstructedMeshWithTrimesh.update(1 / 60);
  assert.ok(
    reconstructedMeshWithTrimesh.position.y < startY,
    'Unified Node physics must apply gravity directly during update(delta)'
  );
  testResults.push('CollisionShape3D (Box, Sphere, Cylinder, Trimesh) & Legacy PhysicsScript Migration: OK');

  // ============================================================================
  // TEST 28: Direct JS Class Extension (`export default class extends Node3D / Mesh3D`) & Type Compatibility
  // ============================================================================
  ScriptClassLoader.clearRegistry();

  const minimalTemplate = generateMinimalNodeScriptTemplate('Player Hero', 'Mesh3D');
  assert.equal(
    minimalTemplate,
    'export default class PlayerHero extends Mesh3D {\n\n}\n',
    'Minimal script template must contain only the class declaration extending the concrete Node type'
  );

  // Syntax validation check (distinguishing syntax errors with line/column)
  const badSyntaxRes = ScriptClassLoader.validateSyntax(
    'export default class Broken extends Node3D {\n  update(delta) {\n    const x = ;\n  }\n}',
    'scripts/Broken.js'
  );
  assert.equal(badSyntaxRes.valid, false, 'Syntax validator must catch invalid JS syntax');
  assert.equal(badSyntaxRes.errorType, 'syntax');
  assert.ok(typeof badSyntaxRes.line === 'number' && badSyntaxRes.line >= 1);

  // Register a valid Mesh3D subclass script and an incompatible UILayer subclass script
  const heroScriptCode = `
export default class HeroController extends Mesh3D {
  health = 100;

  start() {
    this.startedCount = (this.startedCount || 0) + 1;
    this.customTag = 'HeroReady';
  }

  takeDamage(amount) {
    this.health -= amount;
  }

  update(delta) {
    super.update(delta);
    this.position.x += 6 * delta;
  }
}
`;
  const heroDesc = ScriptClassLoader.registerScript({
    uuid: '11111111-2222-4333-8444-555555555555',
    path: 'scripts/HeroController.js',
    sourceCode: heroScriptCode,
  });
  assert.ok(heroDesc.CompiledClass, 'HeroController class must compile cleanly');

  const uiScriptDesc = ScriptClassLoader.registerScript({
    uuid: '22222222-3333-4444-8555-666666666666',
    path: 'scripts/HudController.js',
    sourceCode: 'export default class HudController extends UILayer {\n}\n',
  });

  const heroA = new Mesh3D('Hero_A');
  const heroB = new Mesh3D('Hero_B');

  // Incompatible script assignment must be rejected with clear diagnostic
  const incompatAttempt = ScriptClassLoader.applyScriptClassToNode(heroA, uiScriptDesc);
  assert.equal(incompatAttempt.success, false, 'Incompatible base class (UILayer on Mesh3D) must be blocked');
  assert.ok(incompatAttempt.error && incompatAttempt.error.includes('Mesh3D'));

  // Compatible script assignment must specialize the Node directly without a parallel script instance
  const attachA = ScriptClassLoader.applyScriptClassToNode(heroA, heroDesc);
  const attachB = ScriptClassLoader.applyScriptClassToNode(heroB, heroDesc);
  assert.equal(attachA.success, true);
  assert.equal(attachB.success, true);
  assert.ok(heroA instanceof heroDesc.CompiledClass, 'heroA must be a direct instance of HeroController');
  assert.ok(heroA instanceof Mesh3D, 'heroA must remain an instance of Mesh3D');
  assert.equal(heroA.scripts.length, 0, 'Direct class extension must not create a separate legacy script attachment');

  // Independent per-instance state check
  heroA.takeDamage(35);
  assert.equal(heroA.health, 65, 'Instance A health must update independently');
  assert.equal(heroB.health, 100, 'Instance B health must remain 100');

  heroA.update(0.5);
  assert.equal(heroA.startedCount, 1, 'start() must run once automatically when update() begins');
  assert.ok(Math.abs(heroA.position.x - 3.0) < 1e-4, 'HeroController.update(delta) must move heroA along X');
  assert.equal(heroB.position.x, 0, 'heroB must not move when only heroA is updated');
  testResults.push('Direct JS Class Extension (export default class extends Node), Minimal Template & Compatibility: OK');

  // ============================================================================
  // TEST 29: Unified Physics in `update(delta)` (Gravity, Velocity, Forces, Bounce, Friction, Collisions & Zero Duplication)
  // ============================================================================
  const physicsActorScript = `
export default class PhysicsJumper extends Mesh3D {
  updateCount = 0;

  start() {
    this.enablePhysics('dynamic', {
      mass: 2.0,
      gravityY: -10.0,
      restitution: 0.5,
      friction: 0.4,
      linearDamping: 0.01,
      floorY: 0.5,
    });
  }

  update(delta) {
    super.update(delta);
    this.updateCount += 1;
    if (this.moveRightIntent) {
      this.velocity.x = 4.0;
    }
    if (this.tryClipIntoWall) {
      this.position.x = 2.0; // Static wall is at x = 2.0!
    }
  }
}
`;
  const jumperDesc = ScriptClassLoader.registerScript({
    uuid: '33333333-4444-4555-8666-777777777777',
    path: 'scripts/PhysicsJumper.js',
    sourceCode: physicsActorScript,
  });

  const physicsArenaRoot = new Node3D('PhysicsArena');
  const jumper = new Mesh3D('JumperActor');
  jumper.position = { x: 0, y: 2.0, z: 0 };
  jumper.add(new CollisionShape3DNode('JumperBox', { shapeType: 'Box', size: { x: 1, y: 1, z: 1 } }));
  ScriptClassLoader.applyScriptClassToNode(jumper, jumperDesc);

  const staticWall = new Mesh3D('StaticWall');
  staticWall.position = { x: 2.0, y: 0.5, z: 0 };
  staticWall.enablePhysics('static');
  staticWall.add(new CollisionShape3DNode('WallBox', { shapeType: 'Box', size: { x: 1, y: 4, z: 2 } }));

  const decorativeNonPhysical = new Node3D('DecorativeBanner');
  decorativeNonPhysical.position = { x: 0, y: 5, z: 0 };

  physicsArenaRoot.add(jumper, staticWall, decorativeNonPhysical);
  physicsArenaRoot.initializeSceneLifecycle();

  // 1. Verify single update execution per frame (no duplicate PhysicsScript step)
  const dtStep = 0.05;
  physicsArenaRoot.update(dtStep);
  assert.equal(jumper.updateCount, 1, 'update(delta) must execute exactly once per frame even with super.update(delta)');
  assert.equal(
    decorativeNonPhysical.position.y,
    5,
    'Nodes with physicsMode="none" must not be affected by gravity'
  );

  // 2. Step until jumper hits floorY (0.5) and verify bounce (`restitution = 0.5`) and `isOnFloor()`
  let bouncedUpward = false;
  for (let i = 0; i < 40; i++) {
    physicsArenaRoot.update(0.025);
    if (jumper.isOnFloor() && jumper.velocity.y > 0.1) {
      bouncedUpward = true;
      break;
    }
  }
  assert.equal(bouncedUpward, true, 'Dynamic node must detect floor contact and bounce using restitution');

  // 3. Verify `applyImpulse` and `applyForce` work directly on the Node
  jumper.velocity.set(0, 0, 0);
  jumper.applyImpulse({ x: 0, y: 10, z: 0 }); // mass = 2.0 => dv.y = +5.0
  assert.ok(Math.abs(jumper.velocity.y - 5.0) < 1e-4, 'applyImpulse must scale by inverse mass (J / m)');

  // 4. Verify custom position override in `update(delta)` cannot clip through `StaticWall` collider
  jumper.position = { x: 0.8, y: 0.5, z: 0 };
  jumper.tryClipIntoWall = true;
  physicsArenaRoot.update(1 / 60);
  assert.ok(
    jumper.position.x <= 1.05,
    `Collision resolution must prevent custom update(delta) from penetrating StaticWall (got x=${jumper.position.x})`
  );
  assert.equal(jumper.isColliding(), true, 'Jumper must report active collision with StaticWall');
  testResults.push('Unified Physics in update(delta) (Gravity, Forces, Bounce, Friction, Collisions & Zero Duplication): OK');

  // ============================================================================
  // TEST 30: Native Lifecycle (`start`, `input`, `update`, `onDestroy`), Node States, Error Isolation & `Input`
  // ============================================================================
  const lifecycleScript = `
export default class LifecycleProbe extends Node3D {
  starts = 0;
  updates = 0;
  inputs = 0;
  destroys = 0;

  start() {
    this.starts += 1;
  }

  input(event) {
    this.inputs += 1;
    if (this.consumeAllEvents && event.isActionPressed('jump')) {
      event.consume();
    }
  }

  update(delta) {
    if (this.shouldThrowInUpdate) {
      throw new Error('Falha simulada na instancia isolada');
    }
    this.updates += 1;
  }

  onDestroy() {
    this.destroys += 1;
  }
}
`;
  const probeDesc = ScriptClassLoader.registerScript({
    uuid: '44444444-5555-4666-8777-888888888888',
    path: 'scripts/LifecycleProbe.js',
    sourceCode: lifecycleScript,
  });

  const stageRoot = new Node3D('StageRoot');
  const probe1 = new Node3D('Probe_1');
  const probe2 = new Node3D('Probe_2');
  ScriptClassLoader.applyScriptClassToNode(probe1, probeDesc);
  ScriptClassLoader.applyScriptClassToNode(probe2, probeDesc);
  stageRoot.add(probe1, probe2);

  // Initialize lifecycle: `start()` must run once
  stageRoot.initializeSceneLifecycle();
  stageRoot.initializeSceneLifecycle(); // Calling again must NOT re-run `start()`
  assert.equal(probe1.starts, 1, 'start() must execute only once');

  // Pause & Deactivate: must NOT call `onDestroy()`, and reactivating must NOT re-run `start()`
  probe1.setPaused(true);
  stageRoot.update(1 / 60);
  assert.equal(probe1.updates, 0, 'Paused node must not run update(delta)');
  assert.equal(probe1.destroys, 0, 'Pausing a node must never call onDestroy()');
  assert.equal(probe2.updates, 1, 'Unpaused sibling must continue updating');

  probe1.setPaused(false);
  probe1.setActive(false);
  stageRoot.update(1 / 60);
  assert.equal(probe1.updates, 0, 'Inactive node must not run update(delta)');
  assert.equal(probe1.destroys, 0, 'Deactivating a node must never call onDestroy()');

  probe1.setActive(true);
  assert.equal(probe1.starts, 1, 'Reactivating a node must not execute start() a second time');
  stageRoot.update(1 / 60);
  assert.equal(probe1.updates, 1, 'Reactivated node must resume update(delta)');

  // Dynamically created node added during runtime must automatically run `start()` once
  const dynamicProbe = new Node3D('DynamicProbe');
  ScriptClassLoader.applyScriptClassToNode(dynamicProbe, probeDesc);
  stageRoot.add(dynamicProbe);
  assert.equal(dynamicProbe.starts, 1, 'Dynamically added node in active scene must run start() immediately');

  // Input system: states (`pressed`, `held`, `released`), snake_case queries, event consumption & editor focus block
  Input.reset();
  const downEvt = Input.feedKeyDown('Space');
  assert.equal(Input.getState('jump'), 'pressed');
  assert.equal(Input.is_action_pressed('jump'), true);
  assert.equal(Input.is_action_just_pressed('jump'), true);

  probe1.consumeAllEvents = true;
  Input.dispatchEventToTree(stageRoot, downEvt);
  assert.equal(probe1.inputs, 1, 'First active node must receive input(event)');
  assert.equal(probe2.inputs, 0, 'Consumed input event must not propagate to subsequent nodes');

  Input.stepFrame();
  assert.equal(Input.getState('jump'), 'held', 'Key kept down across frame must transition to held state');
  assert.equal(Input.is_action_just_pressed('jump'), false);
  assert.equal(Input.is_action_pressed('jump'), true);

  Input.feedKeyUp('Space');
  assert.equal(Input.getState('jump'), 'released');
  assert.equal(Input.is_action_just_released('jump'), true);

  // Editor focus blocking
  Input.setEditorFocusBlocked(true);
  Input.feedKeyDown('KeyD');
  assert.equal(
    Input.is_action_pressed('move_right'),
    false,
    'Game input must be ignored while editor text fields or Script Editor have focus'
  );
  Input.setEditorFocusBlocked(false);

  // Runtime error isolation: throwing inside probe1.update() must isolate probe1 without stopping probe2
  probe1.shouldThrowInUpdate = true;
  const prevProbe2Updates = probe2.updates;
  stageRoot.update(1 / 60);
  assert.equal(probe1._scriptInstanceFaulted, true, 'Faulted instance must be isolated after runtime error');
  assert.equal(probe2.updates, prevProbe2Updates + 1, 'Healthy instances must continue updating after sibling error');

  // Definitive destruction: `onDestroy()` runs exactly once
  probe2.destroy();
  probe2.destroy();
  assert.equal(probe2.destroys, 1, 'onDestroy() must run exactly once when definitively destroyed');
  testResults.push('Native Lifecycle (start, input, update, onDestroy), States, Error Isolation & Input Service: OK');

  // ============================================================================
  // TEST 31: Child Scene Instancing (`🎬`), Bidirectional Propagation (`Inside-Out` & `localOverrides`) & Cameras
  // ============================================================================
  const enemyTemplateRoot = new Mesh3D('EnemyBase');
  enemyTemplateRoot.add(new Mesh3D('HelmetVisor', { shape: 'sphere' }));
  const enemyTemplateData = enemyTemplateRoot.serialize();
  const enemySceneUuid = '99999999-aaaa-4bbb-8ccc-dddddddddddd';

  const parentMainScene = new Node3D('MainLevelRoot');
  const guardA = NodeFactory.instantiateChildScene(enemyTemplateData, {
    sourceSceneUuid: enemySceneUuid,
    sourceScenePath: 'scenes/enemy.scene.json',
    instanceName: 'Guard_A',
    localOverrides: { position: { x: 5, y: 0, z: 2 } },
  });
  const guardB = NodeFactory.instantiateChildScene(enemyTemplateData, {
    sourceSceneUuid: enemySceneUuid,
    sourceScenePath: 'scenes/enemy.scene.json',
    instanceName: 'Guard_B',
    localOverrides: { position: { x: -4, y: 0, z: 3 } },
  });
  parentMainScene.add(guardA, guardB);

  assert.notEqual(guardA.uuid, guardB.uuid, 'Two instances of the same Child Scene must have distinct root UUIDs');
  assert.notEqual(
    guardA.getNode('HelmetVisor').uuid,
    guardB.getNode('HelmetVisor').uuid,
    'Internal nodes of instantiated Child Scenes must have independent UUIDs in Runtime'
  );

  // Outside-In Encapsulation: editing Guard_A in MainScene saves only in `localOverrides` without mutating source
  guardA.position = { x: 12, y: 1, z: -3 };
  const serializedMain = parentMainScene.serialize();
  const serializedGuardA = serializedMain.children.find((c) => c.name === 'Guard_A');
  assert.ok(serializedGuardA.sceneInstance, 'Serialized Child Scene instance must carry sceneInstance metadata');
  assert.equal(
    serializedGuardA.children.length,
    0,
    'Parent scene .scene.json must not duplicate internal children of an instantiated Child Scene'
  );
  assert.equal(serializedGuardA.sceneInstance.localOverrides.position.x, 12);
  assert.equal(enemyTemplateData.position.x, 0, 'Source scene template must remain untouched by parent overrides');

  // Inside-Out Propagation: adding a new node (`EnergyShield`) to EnemyScene updates Guard_A and Guard_B while keeping localOverrides
  enemyTemplateRoot.add(new Mesh3D('EnergyShield', { shape: 'cylinder' }));
  const updatedEnemyData = enemyTemplateRoot.serialize();
  const reconciledCount = NodeFactory.reconcileSceneInstances(
    parentMainScene,
    enemySceneUuid,
    updatedEnemyData
  );
  assert.equal(reconciledCount, 2, 'Saving source scene must propagate changes to both Guard_A and Guard_B');
  assert.ok(guardA.getNode('EnergyShield'), 'Guard_A must receive the new EnergyShield node from source scene');
  assert.ok(guardB.getNode('EnergyShield'), 'Guard_B must receive the new EnergyShield node from source scene');
  assert.equal(guardA.position.x, 12, 'Guard_A localOverrides must be preserved after Inside-Out propagation');
  assert.equal(guardB.position.x, -4, 'Guard_B localOverrides must be preserved after Inside-Out propagation');

  // Recursive Camera lookup inside a Child Scene & normal execution without camera
  assert.equal(
    NodeFactory.findActiveCameraRecursively(parentMainScene),
    null,
    'Scene without Camera3D must return null and execute without error'
  );
  parentMainScene.update(1 / 60); // Must run cleanly with no camera

  const subCam = new Camera3D('NestedFollowCam', { fov: 70, current: true });
  guardA.add(subCam);
  const detectedCam = NodeFactory.findActiveCameraRecursively(parentMainScene);
  assert.equal(
    detectedCam,
    subCam,
    'Engine must recursively locate active Camera3D inside an instantiated Child Scene'
  );

  // Axis Guides individual toggle check
  const guides = createEditorGuidesGroup();
  setEditorAxisGuidesVisibility(guides, { x: false, y: true, z: false });
  assert.equal(guides.getObjectByName('__EditorGuide_AxisX').visible, false);
  assert.equal(guides.getObjectByName('__EditorGuide_AxisY').visible, true);
  assert.equal(guides.getObjectByName('__EditorGuide_AxisZ').visible, false);
  testResults.push('Child Scene Instancing (Clapperboard), Bidirectional Propagation (localOverrides) & Recursive Camera: OK');

  // Restore previous globalPathResolver state
  if (prevGlobalRoot) {
    globalPathResolver.setProjectRoot(prevGlobalRoot);
  } else {
    globalPathResolver.clearProjectRoot();
  }

  fs.rmSync(tempDir, { recursive: true, force: true });

  return {
    status: 'PASSED',
    totalTestsPassed: testResults.length,
    tests: testResults,
    registeredBodies: physics.getBodyCount(),
  };
}

function extrasConflictCheck(registry) {
  return registry.scanProject({ autoRegisterUntracked: false }).duplicateConflicts.length;
}

// Execute when run directly via `node src/engine/validate.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  const report = runArchitectureValidation();
  console.log('[Maxros Engine Validation Suite]:', JSON.stringify(report, null, 2));
}
