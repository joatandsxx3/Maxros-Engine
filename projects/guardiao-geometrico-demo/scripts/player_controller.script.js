// Maxros Engine - Script de Controle do Guardião Geométrico (.script.js)
export default {
  onReady(node) {
    node.defineSignal("crystalCollected");
  },
  onProcess(dt, node) {
    node.rotation.y += dt * 1.5;
  }
};
