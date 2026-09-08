// API Response Formatting
// Standardized success responses

import type { GpuSpec } from '../gpu-math/gpus'

/**
 * Format GPU catalog for API response.
 */
export function formatGpuCatalogResponse(gpus: GpuSpec[]) {
  return {
    success: true,
    data: {
      gpus: gpus.map(gpu => ({
        id: gpu.id,
        name: gpu.name,
        memory_gb: gpu.vramGb,
        price_per_hour: gpu.pricePerHour,
        hardware_cost: gpu.hardwareCostPerGpu,
        memory_bandwidth_gbps: gpu.memoryBandwidthGbps,
        tflops: gpu.tflops,
        power_watts: gpu.powerWatts,
        cloud_availability_pct: gpu.cloudAvailabilityPct,
      })),
      count: gpus.length
    }
  }
}
