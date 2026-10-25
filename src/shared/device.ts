/** "metal" → "Metal", "cuda" → "CUDA": a compute backend's display name. */
export function backendName(kind: string): string {
  return kind.toLowerCase() === 'cuda' ? 'CUDA' : kind.charAt(0).toUpperCase() + kind.slice(1)
}

/** "Vulkan (NVIDIA GeForce RTX 4070)", or the backend alone when it reports no devices. */
export function deviceLabel(kind: string, devices: string[]): string {
  return devices.length ? `${backendName(kind)} (${devices.join(', ')})` : backendName(kind)
}
