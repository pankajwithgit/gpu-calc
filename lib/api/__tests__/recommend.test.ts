import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RecommendRequestSchema } from '../schemas'
import { callRecommend, generateRequestId } from '../recommend'
import type { RecommendResult, RecommendErrorResponse } from '../recommend'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const VALID_REQUEST = {
  model_path: 'meta-llama/Llama-3.1-70B-Instruct',
  system: 'h200_sxm',
  backend: 'vllm',
  isl: 2048,
  osl: 128,
  ttft: 1000,
  tpot: 30,
  target_concurrency: 32,
  prefix: 0,
  database_mode: 'HYBRID' as const,
  top_n: 5,
}

const EXTERNAL_RESPONSE = {
  configs: [{
    total_gpus_needed: 4,
    replicas_needed: 1,
    num_total_gpus: 4,
    ttft: 599.81,
    concurrency: 128,
    tpot: 149.95,
    request_latency: 19643.78,
    tokens_per_second: 846.93,
    tokens_per_second_per_gpu: 211.73,
    tokens_per_second_per_user: 6.67,
    memory: 58.61,
    tp: 4,
    pp: 1,
    dp: 1,
  }],
  chosen_mode: 'agg',
}

function mockFetchOk(data: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  })
}

// ─── Schema Tests ────────────────────────────────────────────────────────────

describe('RecommendRequestSchema', () => {
  it('accepts a valid request', () => {
    const result = RecommendRequestSchema.safeParse(VALID_REQUEST)
    expect(result.success).toBe(true)
  })

  it('rejects when both target_request_rate and target_concurrency are set', () => {
    const result = RecommendRequestSchema.safeParse({
      ...VALID_REQUEST,
      target_request_rate: 10,
      target_concurrency: 32,
    })
    expect(result.success).toBe(false)
  })

  it('rejects when neither target_request_rate nor target_concurrency is set', () => {
    const { target_concurrency, ...rest } = VALID_REQUEST
    const result = RecommendRequestSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('accepts a model_config object', () => {
    const result = RecommendRequestSchema.safeParse({
      ...VALID_REQUEST,
      model_config: { hidden_size: 8192, architectures: ['LlamaForCausalLM'] },
    })
    expect(result.success).toBe(true)
  })

  it('accepts target_request_rate instead of target_concurrency', () => {
    const { target_concurrency, ...rest } = VALID_REQUEST
    const result = RecommendRequestSchema.safeParse({ ...rest, target_request_rate: 10 })
    expect(result.success).toBe(true)
  })

  it('rejects missing model_path', () => {
    const { model_path, ...rest } = VALID_REQUEST
    const result = RecommendRequestSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects empty model_path', () => {
    const result = RecommendRequestSchema.safeParse({ ...VALID_REQUEST, model_path: '' })
    expect(result.success).toBe(false)
  })

  it('rejects missing system', () => {
    const { system, ...rest } = VALID_REQUEST
    const result = RecommendRequestSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects zero isl', () => {
    const result = RecommendRequestSchema.safeParse({ ...VALID_REQUEST, isl: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects negative osl', () => {
    const result = RecommendRequestSchema.safeParse({ ...VALID_REQUEST, osl: -1 })
    expect(result.success).toBe(false)
  })

  it('rejects zero ttft', () => {
    const result = RecommendRequestSchema.safeParse({ ...VALID_REQUEST, ttft: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects unknown fields (strict mode)', () => {
    const result = RecommendRequestSchema.safeParse({ ...VALID_REQUEST, extra: 'nope' })
    expect(result.success).toBe(false)
  })
})

// ─── Service Tests ───────────────────────────────────────────────────────────

describe('callRecommend', () => {
  beforeEach(() => {
    vi.stubEnv('AICONFIGURATOR_GATEWAY_URL', 'https://aiconfigurator.dev')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns a normalized response on success', async () => {
    vi.stubGlobal('fetch', mockFetchOk(EXTERNAL_RESPONSE))

    const result = await callRecommend(VALID_REQUEST)

    expect(result.status).toBe('completed')
    const r = result as RecommendResult
    expect(r.requestId).toMatch(/^size_/)
    expect(r.recommendation.gpusNeeded).toBe(4)
    expect(r.recommendation.totalGpus).toBe(4)
    expect(r.recommendation.replicasNeeded).toBe(1)
    expect(r.recommendation.tensorParallelSize).toBe(4)
    expect(r.recommendation.pipelineParallelSize).toBe(1)
    expect(r.recommendation.dataParallelSize).toBe(1)
    expect(r.performance.ttftLatencyMs).toBe(599.81)
    expect(r.performance.tpotMs).toBe(149.95)
    expect(r.performance.concurrency).toBe(128)
    expect(r.throughput.tokensPerSecond).toBe(846.93)
    expect(r.throughput.tokensPerSecondPerGpu).toBe(211.73)
    expect(r.throughput.tokensPerSecondPerUser).toBe(6.67)
    expect(r.memory).toEqual({ value: 58.61, unit: 'GB' })
    expect(r.metadata.modelPath).toBe('meta-llama/Llama-3.1-70B-Instruct')
    expect(r.metadata.system).toBe('h200_sxm')
    expect(r.metadata.durationMs).toBeGreaterThanOrEqual(0)
    expect(r.warnings).toEqual([])
  })

  it('calls /recommend at the configured API URL', async () => {
    const mockFetch = mockFetchOk(EXTERNAL_RESPONSE)
    vi.stubGlobal('fetch', mockFetch)

    await callRecommend(VALID_REQUEST)

    expect(mockFetch.mock.calls[0][0]).toBe('https://aiconfigurator.dev/recommend')
  })

  it('sends correct fields in the upstream request', async () => {
    const mockFetch = mockFetchOk(EXTERNAL_RESPONSE)
    vi.stubGlobal('fetch', mockFetch)

    await callRecommend(VALID_REQUEST)

    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(sentBody.model_path).toBe('meta-llama/Llama-3.1-70B-Instruct')
    expect(sentBody.system).toBe('h200_sxm')
    expect(sentBody.backend).toBe('vllm')
    expect(sentBody.target_concurrency).toBe(32)
    expect(sentBody.tpot).toBe(30)
    expect(sentBody.database_mode).toBe('HYBRID')
    expect(sentBody).not.toHaveProperty('username')
    expect(sentBody).not.toHaveProperty('password')
  })

  it('forwards model_config to the upstream request when present', async () => {
    const mockFetch = mockFetchOk(EXTERNAL_RESPONSE)
    vi.stubGlobal('fetch', mockFetch)

    const model_config = { hidden_size: 8192, architectures: ['LlamaForCausalLM'] }
    await callRecommend({ ...VALID_REQUEST, model_config })

    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(sentBody.model_config).toEqual(model_config)
  })

  it('omits model_config from the upstream request when absent', async () => {
    const mockFetch = mockFetchOk(EXTERNAL_RESPONSE)
    vi.stubGlobal('fetch', mockFetch)

    await callRecommend(VALID_REQUEST)

    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(sentBody).not.toHaveProperty('model_config')
  })

  it('returns AIC_NOT_CONFIGURED when API URL is missing', async () => {
    vi.stubEnv('AICONFIGURATOR_GATEWAY_URL', '')

    const result = await callRecommend(VALID_REQUEST)

    expect(result.status).toBe('failed')
    expect((result as RecommendErrorResponse).error.code).toBe('AIC_NOT_CONFIGURED')
  })

  it('returns AIC_TIMEOUT on fetch timeout', async () => {
    const timeoutError = new Error('signal timed out')
    timeoutError.name = 'TimeoutError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError))

    const result = await callRecommend(VALID_REQUEST)

    expect(result.status).toBe('failed')
    expect((result as RecommendErrorResponse).error.code).toBe('AIC_TIMEOUT')
  })

  it('returns AIC_UNAVAILABLE on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))

    const result = await callRecommend(VALID_REQUEST)

    expect(result.status).toBe('failed')
    expect((result as RecommendErrorResponse).error.code).toBe('AIC_UNAVAILABLE')
  })

  it('returns AIC_UNAVAILABLE on 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ detail: 'internal error' }),
    }))

    const result = await callRecommend(VALID_REQUEST)

    expect(result.status).toBe('failed')
    expect((result as RecommendErrorResponse).error.code).toBe('AIC_UNAVAILABLE')
  })

  it('returns AIC_NO_CONFIGURATION on 422', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ detail: 'No configuration meets the specified requirements.' }),
    }))

    const result = await callRecommend(VALID_REQUEST)

    expect(result.status).toBe('failed')
    expect((result as RecommendErrorResponse).error.code).toBe('AIC_NO_CONFIGURATION')
  })

  it('returns AIC_INVALID_RESPONSE on non-JSON response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('invalid json')),
    }))

    const result = await callRecommend(VALID_REQUEST)

    expect(result.status).toBe('failed')
    expect((result as RecommendErrorResponse).error.code).toBe('AIC_INVALID_RESPONSE')
  })

  it('returns AIC_NO_CONFIGURATION when configs array is empty', async () => {
    vi.stubGlobal('fetch', mockFetchOk({ configs: [], chosen_mode: 'agg' }))

    const result = await callRecommend(VALID_REQUEST)

    expect(result.status).toBe('failed')
    expect((result as RecommendErrorResponse).error.code).toBe('AIC_NO_CONFIGURATION')
  })

  it('adds GPU_TOPOLOGY_MISMATCH warning when parallelism does not match GPU count', async () => {
    const mismatchResponse = {
      configs: [{
        ...EXTERNAL_RESPONSE.configs[0],
        tp: 2,
        pp: 1,
        dp: 1,
        num_total_gpus: 4,
      }],
      chosen_mode: 'agg',
    }
    vi.stubGlobal('fetch', mockFetchOk(mismatchResponse))

    const result = await callRecommend(VALID_REQUEST) as RecommendResult

    expect(result.status).toBe('completed')
    expect(result.warnings.some(w => w.code === 'GPU_TOPOLOGY_MISMATCH')).toBe(true)
  })

  it('includes durationMs in metadata', async () => {
    vi.stubGlobal('fetch', mockFetchOk(EXTERNAL_RESPONSE))

    const result = await callRecommend(VALID_REQUEST) as RecommendResult

    expect(result.metadata.durationMs).toBeTypeOf('number')
    expect(result.metadata.durationMs).toBeGreaterThanOrEqual(0)
  })
})

// ─── Request ID Tests ────────────────────────────────────────────────────────

describe('generateRequestId', () => {
  it('starts with size_ prefix', () => {
    expect(generateRequestId()).toMatch(/^size_/)
  })

  it('is 17 characters long', () => {
    expect(generateRequestId()).toHaveLength(17)
  })

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, generateRequestId))
    expect(ids.size).toBe(100)
  })
})
