export interface WorkloadPreset {
  key: string
  label: string
  isl: number
  osl: number
  ttft: number
  tpot: number
  concurrency: number
  prefix: number
}

export const DEFAULT_WORKLOAD: WorkloadPreset = {
  key: 'default',
  label: 'Default',
  isl: 2048,
  osl: 128,
  ttft: 1000,
  tpot: 30,
  concurrency: 1,
  prefix: 0,
}
