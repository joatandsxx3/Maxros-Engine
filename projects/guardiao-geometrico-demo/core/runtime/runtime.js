import * as Engine from '../engine/index.js';

export function createProjectRuntime(sceneData) {
  const physics = Engine.PhysicsServer.getInstance();
  physics.clear();
  const root = Engine.NodeFactory.createFromData(sceneData, { physicsServer: physics });
  const tree = new Engine.SceneTree(root);
  tree.setNodeFactory(Engine.NodeFactory);
  return { root, tree, physics, Engine };
}

export { Engine };
