(function () {
  // Carregado logo após o A-Frame para impedir que geometrias com NaN sujem o console
  // ou quebrem o cálculo interno de boundingSphere/boundingBox do Three.js.
  if (!window.THREE || !THREE.BufferGeometry || THREE.BufferGeometry.__corpusSafeGeometryPatched) return;

  const sanitizeGeometry = function (geometry) {
    if (!geometry || !geometry.attributes) return false;

    let changed = false;
    Object.keys(geometry.attributes).forEach(function (key) {
      const attr = geometry.attributes[key];
      const array = attr && attr.array;
      if (!array) return;

      for (let i = 0; i < array.length; i++) {
        if (!Number.isFinite(array[i])) {
          array[i] = 0;
          changed = true;
        }
      }

      if (changed && attr) attr.needsUpdate = true;
    });

    return changed;
  };

  const originalSphere = THREE.BufferGeometry.prototype.computeBoundingSphere;
  const originalBox = THREE.BufferGeometry.prototype.computeBoundingBox;

  THREE.BufferGeometry.prototype.computeBoundingSphere = function () {
    sanitizeGeometry(this);
    try {
      return originalSphere.apply(this, arguments);
    } catch (err) {
      this.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 0);
      return this.boundingSphere;
    }
  };

  THREE.BufferGeometry.prototype.computeBoundingBox = function () {
    sanitizeGeometry(this);
    try {
      return originalBox.apply(this, arguments);
    } catch (err) {
      this.boundingBox = new THREE.Box3(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, 0)
      );
      return this.boundingBox;
    }
  };

  THREE.BufferGeometry.__corpusSafeGeometryPatched = true;
})();
