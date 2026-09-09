import type { GpuSizerRequest } from './schemas'

// ─── Types ───────────────────────────────────────────────────────────────────

interface GpuSizerWarning {
  code: string
  message: string
}

export interface GpuSizerResult {
  requestId: string
  status: 'completed'
  recommendation: {
    gpusNeeded: number
    totalGpus: number
    replicasNeeded: number
    tensorParallelSize: number
    pipelineParallelSize: number
    dataParallelSize: number
  }
  performance: {
    ttftLatencyMs: number
    tpotMs: number
    requestLatencyMs: number
    concurrency: number
  }
  throughput: {
    tokensPerSecond: number
    tokensPerSecondPerGpu: number
    tokensPerSecondPerUser: number
  }
  memory: {
    value: number
    unit: 'GB'
    scope: 'unspecified'
  }
  metadata: {
    modelPath: string
    system: string
    inputTokens: number
    outputTokens: number
    targetTtftMs: number
    durationMs: number
  }
  warnings: GpuSizerWarning[]
}

export interface GpuSizerErrorResponse {
  requestId: string
  status: 'failed'
  error: {
    code: string
    message: string
  }
}

export type GpuSizerResponse = GpuSizerResult | GpuSizerErrorResponse

// ─── Request ID ──────────────────────────────────────────────────────────────

export function generateRequestId(): string {
  return 'size_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

// ─── Service ─────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_SECONDS = 90

export async function callGpuSizer(
  request: GpuSizerRequest
): Promise<GpuSizerResponse> {
  const requestId = generateRequestId()
  const startTime = performance.now()

  const baseUrl = process.env.AICONFIGURATOR_GATEWAY_URL
  const timeoutSeconds = parseInt(process.env.AICONFIGURATOR_TIMEOUT_SECONDS || '', 10) || DEFAULT_TIMEOUT_SECONDS

  if (!baseUrl) {
    return makeError(requestId, 'AIC_NOT_CONFIGURED', 'AIConfigurator API URL is not configured')
  }

  const externalPayload: Record<string, unknown> = {
    model_path: request.model_path,
    system: request.system,
    backend: request.backend ?? 'vllm',
    isl: request.isl,
    osl: request.osl,
    ttft: request.ttft,
    tpot: request.tpot ?? 30,
    database_mode: request.database_mode ?? 'HYBRID',
    top_n: request.top_n ?? 5,
  }

  if (request.backend_version != null) externalPayload.backend_version = request.backend_version
  if (request.target_request_rate != null) externalPayload.target_request_rate = request.target_request_rate
  if (request.target_concurrency != null) externalPayload.target_concurrency = request.target_concurrency
  if (request.request_latency != null) externalPayload.request_latency = request.request_latency
  if (request.prefix != null) externalPayload.prefix = request.prefix
  if (request.model_config != null) externalPayload.model_config = request.model_config

  let response: Response
  try {
    response = await fetch(`${baseUrl}/recommend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(externalPayload),
      signal: AbortSignal.timeout(timeoutSeconds * 1000),
    })
  } catch (err: unknown) {
    const durationMs = Math.round(performance.now() - startTime)
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      return makeError(requestId, 'AIC_TIMEOUT', `The AIConfigurator API did not respond within ${timeoutSeconds} seconds (waited ${durationMs}ms)`)
    }
    return makeError(requestId, 'AIC_UNAVAILABLE', 'AIConfigurator API is unreachable')
  }

  if (!response.ok) {
    let detail = `AIConfigurator API returned HTTP ${response.status}`
    try {
      const body = await response.json()
      if (typeof body.detail === 'string') detail = body.detail
    } catch { /* ignore parse errors */ }

    const code = response.status === 422 ? 'AIC_NO_CONFIGURATION' : 'AIC_UNAVAILABLE'
    return makeError(requestId, code, detail)
  }

  let rawData: Record<string, unknown>
  try {
    rawData = await response.json() as Record<string, unknown>
  } catch {
    return makeError(requestId, 'AIC_INVALID_RESPONSE', 'AIConfigurator API returned non-JSON response')
  }

  const configs = rawData.configs as Array<Record<string, unknown>> | undefined
  if (!configs || configs.length === 0) {
    return makeError(requestId, 'AIC_NO_CONFIGURATION', 'No valid GPU configuration found for this model and hardware combination.')
  }

  const best = configs[0]
  const totalGpusNeeded = (best.total_gpus_needed as number) ?? 0
  const numTotalGpus = (best.num_total_gpus as number) ?? totalGpusNeeded
  const tp = (best.tp as number) ?? 1
  const pp = (best.pp as number) ?? 1
  const dp = (best.dp as number) ?? 1
  const replicasNeeded = (best.replicas_needed as number) ?? 1

  const warnings: GpuSizerWarning[] = []
  const parallelismProduct = tp * pp * dp
  if (parallelismProduct !== numTotalGpus) {
    warnings.push({
      code: 'GPU_TOPOLOGY_MISMATCH',
      message: `Parallelism dimensions (TP=${tp} x PP=${pp} x DP=${dp} = ${parallelismProduct}) do not equal GPUs per worker (${numTotalGpus})`,
    })
  }

  const durationMs = Math.round(performance.now() - startTime)

  return {
    requestId,
    status: 'completed',
    recommendation: {
      gpusNeeded: totalGpusNeeded,
      totalGpus: numTotalGpus,
      replicasNeeded,
      tensorParallelSize: tp,
      pipelineParallelSize: pp,
      dataParallelSize: dp,
    },
    performance: {
      ttftLatencyMs: (best.ttft as number) ?? 0,
      tpotMs: (best.tpot as number) ?? 0,
      requestLatencyMs: (best.request_latency as number) ?? 0,
      concurrency: (best.concurrency as number) ?? 0,
    },
    throughput: {
      tokensPerSecond: (best.tokens_per_second as number) ?? 0,
      tokensPerSecondPerGpu: (best.tokens_per_second_per_gpu as number) ?? 0,
      tokensPerSecondPerUser: (best.tokens_per_second_per_user as number) ?? 0,
    },
    memory: {
      value: (best.memory as number) ?? 0,
      unit: 'GB',
      scope: 'unspecified',
    },
    metadata: {
      modelPath: request.model_path,
      system: request.system,
      inputTokens: request.isl,
      outputTokens: request.osl,
      targetTtftMs: request.ttft,
      durationMs,
    },
    warnings,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeError(requestId: string, code: string, message: string): GpuSizerErrorResponse {
  return { requestId, status: 'failed', error: { code, message } }
}
