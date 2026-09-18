import * as THREE from 'three';

/**
 * Dispose a short-lived runtime object that will never be reused.
 *
 * IMPORTANT: only call this for objects created specifically for the transient
 * instance being removed (police pursuit cars, roadblocks, temporary drivers,
 * fire markers, etc.). Do not use it on authored world roots or shared assets.
 */
export function disposeTransientObject3D(root: THREE.Object3D | null | undefined) {
  if (!root) return;
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) && !(obj instanceof THREE.Points) && !(obj instanceof THREE.Line)) return;

    const geometry = (obj as THREE.Mesh | THREE.Points | THREE.Line).geometry as THREE.BufferGeometry | undefined;
    if (geometry) geometries.add(geometry);

    const material = (obj as THREE.Mesh | THREE.Points | THREE.Line).material as THREE.Material | THREE.Material[] | undefined;
    const objectMaterials = Array.isArray(material) ? material : material ? [material] : [];
    objectMaterials.forEach((mat) => materials.add(mat));
  });

  // A transient hierarchy can reuse one geometry/material across several child
  // meshes. Dispose each GPU resource once even when it has multiple local users.
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((mat) => {
    // Runtime pursuit/driver/fire objects are procedural colour-only assets.
    // Dispose their material/program state here; texture ownership stays with the
    // caller so this helper can never destroy a shared world texture.
    mat.dispose();
  });
}
