'use client'

import * as React from 'react'
import { Alert, Label, Spinner } from '@patternfly/react-core'
import CheckCircleIcon from '@patternfly/react-icons/dist/esm/icons/check-circle-icon'
import { formatBytes } from '@/lib/utils/format'
import { useCountUp } from '@/app/performance/quickEstimateHelpers'
import { useAicCatalog } from '@/lib/hooks/useAicCatalog'
import { useSettings, type InferenceBackend } from '@/contexts/SettingsContext'
import { getAppConfig } from '@/lib/app-config'
import { ModelInput, type ModelStatus } from '@/components/ui/ModelInput'
import { GpuSystemInput } from '@/components/ui/GpuSystemInput'
import type { KvCacheCalcResult } from '@/lib/api/kv-cache-calc'
import styles from './KvCacheCalc.module.css'


const BREAKDOWN_COLORS: Record<string, string> = {
  kv: '#0066cc',
  weights: '#5e40be',
  activations: '#f0ab00',
  runtime: '#3e8635',
  comm: '#009596',
}

export default function KvCacheCalc() {
  const { hydrated, defaultModel: settingsDefaultModel, inferenceBackend, backendVersion: settingsBackendVersion } = useSettings()
  const { modelOptions: aicModels, gpuOptions: aicGpus, isLoading: catalogLoading } = useAicCatalog()
  const MODEL_OPTIONS = aicModels

  const [model, setModel] = React.useState('')
  const [system, setSystem] = React.useState(() => getAppConfig().defaultSystem)
  const [backend, setBackend] = React.useState(() => getAppConfig().defaultBackend)
  const [backendVersion, setBackendVersion] = React.useState(() => {
    const cfg = getAppConfig()
    return cfg.backendVersions[cfg.defaultBackend] ?? ''
  })

  // Initialise model, backend, and version from settings once context has loaded from localStorage
  const fromSettings = React.useRef(false)
  React.useEffect(() => {
    if (!hydrated || fromSettings.current) return
    fromSettings.current = true
    setModel(settingsDefaultModel)
    setBackend(inferenceBackend)
    setBackendVersion(settingsBackendVersion)
  }, [hydrated, settingsDefaultModel, inferenceBackend, settingsBackendVersion])
  const [maxNumTokens, setMaxNumTokens] = React.useState(8192)
  const [maxBatchSize, setMaxBatchSize] = React.useState(128)
  const [tpSize, setTpSize] = React.useState(1)
  const [ppSize, setPpSize] = React.useState(1)
  const [moeTpSize, setMoeTpSize] = React.useState('')
  const [moeEpSize, setMoeEpSize] = React.useState('')
  const [memFractionKind, setMemFractionKind] = React.useState('of_total')
  const [memFractionValue, setMemFractionValue] = React.useState(1.0)
  const [advancedOpen, setAdvancedOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [result, setResult] = React.useState<KvCacheCalcResult | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [flipped, setFlipped] = React.useState<Record<string, boolean>>({})
  const [debugOpen, setDebugOpen] = React.useState(false)
  const [debugRequest, setDebugRequest] = React.useState<Record<string, unknown> | null>(null)
  const [debugResponse, setDebugResponse] = React.useState<Record<string, unknown> | null>(null)
  const [debugStatus, setDebugStatus] = React.useState<number | null>(null)
  const [debugDuration, setDebugDuration] = React.useState<number | null>(null)

  const [maxNumTokensInput, setMaxNumTokensInput] = React.useState('8192')
  const [maxBatchSizeInput, setMaxBatchSizeInput] = React.useState('128')
  const [tpSizeInput, setTpSizeInput] = React.useState('1')
  const [ppSizeInput, setPpSizeInput] = React.useState('1')
  const [memFractionValueInput, setMemFractionValueInput] = React.useState('1.0')

  const invalidMaxNumTokens = maxNumTokensInput === '' || parseInt(maxNumTokensInput, 10) < 1;
  const invalidMaxBatchSize = maxBatchSizeInput === '' || parseInt(maxBatchSizeInput, 10) < 1;
  const invalidTpSize = tpSizeInput === '' || parseInt(tpSizeInput, 10) < 1;
  const invalidPpSize = ppSizeInput === '' || parseInt(ppSizeInput, 10) < 1;
  const invalidMemFractionValue = memFractionValueInput === '' || !Number.isFinite(Number(memFractionValueInput)) || Number(memFractionValueInput) < 0 || Number(memFractionValueInput) > 1;

  const handleMaxNumTokensChange = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '');
    setMaxNumTokensInput(digits);
    const n = parseInt(digits, 10);
    if (!isNaN(n) && n >= 1) setMaxNumTokens(n);
  };
  
  const handleMaxBatchSizeChange = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '');
    setMaxBatchSizeInput(digits);
    const n = parseInt(digits, 10);
    if (!isNaN(n) && n >= 1) setMaxBatchSize(n);
  };

  const handleTpSizeChange = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '');
    setTpSizeInput(digits);
    const n = parseInt(digits, 10);
    if (!isNaN(n) && n >= 1) setTpSize(n);
  };

  const handlePpSizeChange = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '');
    setPpSizeInput(digits);
    const n = parseInt(digits, 10);
    if (!isNaN(n) && n >= 1) setPpSize(n);
  };

  const handleMemFractionValueChange = (raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    setMemFractionValueInput(cleaned);
    const n = Number(cleaned);
    if (Number.isFinite(n) && n >= 0 && n <= 1) setMemFractionValue(n);
  };

  const catalogMatch = MODEL_OPTIONS.includes(model)
  const kvModelStatus: ModelStatus = getAppConfig().testedModels.includes(model)
    ? 'supported'
    : catalogMatch ? 'catalog'
    : catalogLoading ? 'fetching'
    : model ? 'idle' : 'idle'

  async function handleCalculate() {
    setLoading(true)
    setError(null)
    setResult(null)

    const requestBody: Record<string, unknown> = {
      model_path: model,
      system,
      backend,
      max_num_tokens: maxNumTokens,
      max_batch_size: maxBatchSize,
      tp_size: tpSize,
      pp_size: ppSize,
      memory_fraction_kind: memFractionKind,
      memory_fraction_value: memFractionValue,
    }
    if (backendVersion.trim()) requestBody.backend_version = backendVersion.trim()
    const moeTp = parseInt(moeTpSize, 10)
    if (!isNaN(moeTp) && moeTp > 0) requestBody.moe_tp_size = moeTp
    const moeEp = parseInt(moeEpSize, 10)
    if (!isNaN(moeEp) && moeEp > 0) requestBody.moe_ep_size = moeEp
    setDebugRequest(requestBody)
    setDebugResponse(null)
    setDebugStatus(null)
    setDebugDuration(null)

    const t0 = performance.now()

    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const data = await res.json()
      setDebugResponse(data)
      setDebugStatus(res.status)
      setDebugDuration(Math.round(performance.now() - t0))

      if (data.status === 'failed') {
        setError(data.error?.message ?? 'An unexpected error occurred')
        return
      }

      setResult(data as KvCacheCalcResult)
    } catch {
      setDebugDuration(Math.round(performance.now() - t0))
      setError('Failed to connect to the server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function toggleFlip(id: string) {
    setFlipped(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const animKv = useCountUp(result?.kvCache.totalBytes ?? 0, 800)
  const animPerToken = useCountUp(result?.kvCache.perTokenBytes ?? 0, 800)
  const animTokens = useCountUp(result?.kvCache.totalTokens ?? 0, 800)
  const animGpuCap = useCountUp(result?.gpuCapacity.totalBytes ?? 0, 800)

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>KV cache calculator</h1>
        <p className={styles.subtitle}>
          Calculate KV cache memory requirements for any model on supported GPU systems
        </p>
      </div>

      {/* Input card */}
      <div className={styles.inputCard}>
        <div className={styles.inputRow}>
          <div className={styles.field}>
            <ModelInput
              id="kv-model"
              model={model}
              onChange={setModel}
              modelOptions={aicModels}
              isLoading={catalogLoading}
              status={kvModelStatus}
            />
          </div>

          <GpuSystemInput id="kv-gpu" value={system} onChange={setSystem} gpuOptions={aicGpus} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button
            type="button"
            className={styles.calcBtn}
            onClick={handleCalculate} 
            disabled={loading || !model.trim() || invalidMaxNumTokens || invalidMaxBatchSize || invalidTpSize || invalidPpSize || invalidMemFractionValue}
          >
            {loading ? 'Calculating…' : 'Calculate'}
          </button>
        </div>

        {/* Advanced settings accordion */}
        <button
          type="button"
          className={styles.advancedToggle}
          onClick={() => setAdvancedOpen(prev => !prev)}
          aria-expanded={advancedOpen}
        >
          <span className={styles.advancedToggleIcon}>{advancedOpen ? '▾' : '▸'}</span>
          Advanced settings
          {!advancedOpen && (
            <span className={styles.advancedSummary}>
              {backend}{backendVersion ? ` v${backendVersion}` : ''} · tokens: {maxNumTokens.toLocaleString()} · batch: {maxBatchSize} · TP {tpSize}{ppSize > 1 ? ` · PP ${ppSize}` : ''}{moeTpSize ? ` · MoE TP ${moeTpSize}` : ''}
            </span>
          )}
        </button>
        {advancedOpen && (
          <div className={styles.advancedBody}>
            {/* Serving config */}
            <div className={styles.advancedSectionLabel}>Serving config</div>
            <div className={styles.advancedRow4}>
              <div className={styles.field}>
                <label htmlFor="kv-backend" className={styles.fieldLabel}>Backend</label>
                <select
                  id="kv-backend"
                  value={backend}
                  onChange={e => setBackend(e.target.value)}
                  className={styles.gpuSelect}
                >
                  <option value="vllm">vLLM</option>
                  <option value="sglang">SGLang</option>
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="kv-backend-ver" className={styles.fieldLabel}>Backend version</label>
                <input
                  type="text"
                  id="kv-backend-ver"
                  value={backendVersion}
                  onChange={e => setBackendVersion(e.target.value)}
                  placeholder={getAppConfig().backendVersions[backend] ?? 'latest'}
                  className={styles.numberInput}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="kv-tokens" className={styles.fieldLabel}>Max num tokens</label>
                <input
                  type="number"
                  id="kv-tokens"
                  value={maxNumTokensInput}
                  onChange={e => handleMaxNumTokensChange(e.target.value)}
                  min={1}
                  className={invalidMaxNumTokens ? styles.paramInputInvalid : styles.numberInput}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="kv-batch" className={styles.fieldLabel}>Max batch size</label>
                <input
                  type="number"
                  id="kv-batch"
                  value={maxBatchSizeInput}
                  onChange={e => handleMaxBatchSizeChange(e.target.value)}
                  min={1}
                  className={invalidMaxBatchSize ? styles.paramInputInvalid : styles.numberInput}
                />
              </div>
            </div>

            {/* Parallelism */}
            <div className={styles.advancedSectionLabel}>Parallelism</div>
            <div className={styles.advancedRow4}>
              <div className={styles.field}>
                <label htmlFor="kv-tp" className={styles.fieldLabel}>TP size</label>
                <input
                  type="number"
                  id="kv-tp"
                  value={tpSizeInput}
                  onChange={e => handleTpSizeChange(e.target.value)}
                  min={1}
                  className={invalidTpSize ? styles.paramInputInvalid : styles.numberInput}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="kv-pp" className={styles.fieldLabel}>PP size</label>
                <input
                  type="number"
                  id="kv-pp"
                  value={ppSizeInput}
                  onChange={e => handlePpSizeChange(e.target.value)}
                  min={1}
                  className={invalidPpSize ? styles.paramInputInvalid : styles.numberInput}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="kv-moe-tp" className={styles.fieldLabel}>MoE TP size</label>
                <input
                  type="text"
                  id="kv-moe-tp"
                  value={moeTpSize}
                  onChange={e => setMoeTpSize(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="auto"
                  className={styles.numberInput}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="kv-moe-ep" className={styles.fieldLabel}>MoE EP size</label>
                <input
                  type="text"
                  id="kv-moe-ep"
                  value={moeEpSize}
                  onChange={e => setMoeEpSize(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="auto"
                  className={styles.numberInput}
                />
              </div>
            </div>

            {/* Memory */}
            <div className={styles.advancedSectionLabel}>Memory</div>
            <div className={styles.advancedRow2}>
              <div className={styles.field}>
                <label htmlFor="kv-mem-val" className={styles.fieldLabel}>Memory fraction</label>
                <input
                  type="number"
                  id="kv-mem-val"
                  value={memFractionValueInput}
                  onChange={e => handleMemFractionValueChange(e.target.value)}
                  min={0}
                  max={1}
                  step={0.05}
                  className={invalidMemFractionValue ? styles.paramInputInvalid : styles.numberInput}
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="kv-mem-kind" className={styles.fieldLabel}>Fraction kind</label>
                <select
                  id="kv-mem-kind"
                  value={memFractionKind}
                  onChange={e => setMemFractionKind(e.target.value)}
                  className={styles.gpuSelect}
                >
                  <option value="of_total">of_total</option>
                  <option value="of_free">of_free</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className={styles.errorAlert}>
          <Alert variant={error.toLowerCase().includes('unsupported') ? 'warning' : 'danger'} title="Calculation failed" isInline>
            <p>{error}</p>
            <p style={{ marginTop: 8 }}>
              You can also try using our{' '}
              <a href="/performance" className={styles.errorLink}>
                Performance estimate
              </a>{' '}
              for an approximate KV cache calculation.
            </p>
          </Alert>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className={styles.loadingWrap}>
          <Spinner size="lg" />
          <span>Calculating KV cache requirements…</span>
        </div>
      )}

      {/* Placeholder */}
      {!loading && !result && !error}

      {/* Results */}
      {result && !loading && (
        <>
          {/* Tiles */}
          <div className={styles.tilesGrid}>
            {/* Total KV cache */}
            <TileCard
              id="total"
              dark
              label="Available for KV cache / GPU"
              value={formatBytes(animKv)}
              sub={`${result.kvCache.totalTokens.toLocaleString()} tokens capacity`}
              flipped={flipped.total ?? false}
              onFlip={() => toggleFlip('total')}
              backContent={
                <>
                  <div className={styles.backTitle}>KV cache / GPU detail</div>
                  <BackRow label="Raw bytes" value={result.kvCache.totalBytes.toLocaleString()} dark />
                  <BackRow label="Total tokens" value={result.kvCache.totalTokens.toLocaleString()} dark />
                  <BackRow label="Per token" value={`${result.kvCache.perTokenBytes.toLocaleString()} B`} dark />
                  <BackRow label="Source" value={result.metadata.source} dark />
                </>
              }
            />

            {/* Per token */}
            <TileCard
              id="pertoken"
              label="Per token"
              value={formatBytes(animPerToken)}
              sub="KV cache memory per token"
              flipped={flipped.pertoken ?? false}
              onFlip={() => toggleFlip('pertoken')}
              backContent={
                <>
                  <div className={styles.backTitle}>Per-token detail</div>
                  <BackRow label="Bytes/token" value={result.kvCache.perTokenBytes.toLocaleString()} />
                  <BackRow label="Total tokens" value={result.kvCache.totalTokens.toLocaleString()} />
                </>
              }
            />

            {/* Token capacity */}
            <TileCard
              id="tokens"
              label="Token capacity"
              value={animTokens.toLocaleString()}
              sub="Max tokens in KV cache"
              flipped={flipped.tokens ?? false}
              onFlip={() => toggleFlip('tokens')}
              backContent={
                <>
                  <div className={styles.backTitle}>Capacity detail</div>
                  <BackRow label="Total tokens" value={result.kvCache.totalTokens.toLocaleString()} />
                  <BackRow label="KV size" value={formatBytes(result.kvCache.totalBytes)} />
                  <BackRow label="Per token" value={`${result.kvCache.perTokenBytes.toLocaleString()} B`} />
                </>
              }
            />

            {/* GPU capacity */}
            <TileCard
              id="gpu"
              label="GPU memory"
              value={formatBytes(animGpuCap)}
              sub={`${result.metadata.system} total capacity`}
              flipped={flipped.gpu ?? false}
              onFlip={() => toggleFlip('gpu')}
              backContent={
                <>
                  <div className={styles.backTitle}>GPU memory detail</div>
                  <BackRow label="Total GPU" value={formatBytes(result.gpuCapacity.totalBytes)} />
                  <BackRow label="KV cache" value={formatBytes(result.kvCache.totalBytes)} />
                  <BackRow label="KV % of GPU" value={`${((result.kvCache.totalBytes / result.gpuCapacity.totalBytes) * 100).toFixed(1)}%`} />
                </>
              }
            />
          </div>

          {/* Memory breakdown bar */}
          <MemoryBreakdownSection result={result} />

          {/* Metadata */}
          <div className={styles.configSection}>
            <div className={styles.configTitle}>Request details</div>
            <div className={styles.configGrid}>
              <ConfigItem label="Model" value={result.metadata.modelPath} />
              <ConfigItem label="Backend" value={result.metadata.backendVersion ? `${result.metadata.backend} v${result.metadata.backendVersion}` : result.metadata.backend} />
              <ConfigItem label="GPU system" value={result.metadata.system} />
              <ConfigItem label="Max tokens" value={result.metadata.maxNumTokens.toLocaleString()} />
              <ConfigItem label="Batch size" value={result.metadata.maxBatchSize.toLocaleString()} />
              <ConfigItem label="TP / PP" value={`${result.metadata.tpSize} / ${result.metadata.ppSize}`} />
              {result.metadata.moeTpSize != null && <ConfigItem label="MoE TP" value={String(result.metadata.moeTpSize)} />}
              {result.metadata.moeEpSize != null && <ConfigItem label="MoE EP" value={String(result.metadata.moeEpSize)} />}
              <ConfigItem label="Mem fraction" value={`${result.metadata.memoryFractionValue} (${result.metadata.memoryFractionKind})`} />
              <ConfigItem label="Source" value={result.metadata.source} />
            </div>
          </div>
        </>
      )}

      {/* Debug panel */}
      {(debugRequest || debugResponse) && (
        <div className={styles.debugSection}>
          <button
            type="button"
            className={styles.debugToggle}
            onClick={() => setDebugOpen(prev => !prev)}
            aria-expanded={debugOpen}
          >
            <span className={styles.debugToggleIcon}>{debugOpen ? '▾' : '▸'}</span>
            Debug panel
            {debugStatus !== null && (
              <span className={`${styles.debugStatusBadge} ${debugStatus >= 200 && debugStatus < 300 ? styles.debugStatusOk : styles.debugStatusErr}`}>
                {debugStatus}
              </span>
            )}
            {debugDuration !== null && (
              <span className={styles.debugDuration}>{debugDuration}ms</span>
            )}
          </button>
          {debugOpen && (
            <div className={styles.debugBody}>
              <div className={styles.debugPane}>
                <div className={styles.debugPaneHeader}>Request → POST /api/memory</div>
                <pre className={styles.debugPre}>
                  {JSON.stringify(debugRequest, null, 2)}
                </pre>
              </div>
              <div className={styles.debugPane}>
                <div className={styles.debugPaneHeader}>
                  Response
                  {debugStatus !== null && ` (${debugStatus})`}
                </div>
                <pre className={styles.debugPre}>
                  {debugResponse ? JSON.stringify(debugResponse, null, 2) : '(no response)'}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

interface TileCardProps {
  id: string
  dark?: boolean
  label: string
  value: string
  sub: string
  flipped: boolean
  onFlip: () => void
  backContent: React.ReactNode
}

function TileCard({ dark, label, value, sub, flipped, onFlip, backContent }: TileCardProps) {
  return (
    <div
      className={`${styles.tileCard} ${dark ? styles.tileDark : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      onClick={() => { if (!flipped) onFlip() }}
      onKeyDown={e => {
        if ((e.key === 'Enter' || e.key === ' ') && !flipped) {
          e.preventDefault()
          onFlip()
        }
      }}
    >
      {!flipped ? (
        <>
          <div className={styles.tileLabel}>{label}</div>
          <div className={styles.tileValue}>{value}</div>
          <div className={styles.tileSub}>{sub}</div>
          <span className={styles.seeMath}>&#8635; details</span>
        </>
      ) : (
        <>
          {backContent}
          <span
            className={styles.seeMath}
            role="button"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); onFlip() }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onFlip() } }}
          >
            &#8635; flip back
          </span>
        </>
      )}
    </div>
  )
}

function BackRow({ label, value }: { label: string; value: string; dark?: boolean }) {
  return (
    <div className={styles.backRow}>
      <span className={styles.backRowLabel}>{label}</span>
      <span className={styles.backRowValue}>{value}</span>
    </div>
  )
}

function ConfigItem({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.configItem}>
      <span className={styles.configLabel}>{label}</span>
      <span className={styles.configValue}>{value}</span>
    </div>
  )
}

function MemoryBreakdownSection({ result }: { result: KvCacheCalcResult }) {
  const segments = [
    { label: 'KV cache', bytes: result.kvCache.totalBytes, color: BREAKDOWN_COLORS.kv },
    { label: 'Weights', bytes: result.memoryBreakdown.weightsBytes, color: BREAKDOWN_COLORS.weights },
    { label: 'Activations', bytes: result.memoryBreakdown.activationsBytes, color: BREAKDOWN_COLORS.activations },
    { label: 'Runtime', bytes: result.memoryBreakdown.runtimeOverheadBytes, color: BREAKDOWN_COLORS.runtime },
  ]

  if (result.memoryBreakdown.commOverheadBytes > 0) {
    segments.push({ label: 'Comm', bytes: result.memoryBreakdown.commOverheadBytes, color: BREAKDOWN_COLORS.comm })
  }

  const totalUsed = segments.reduce((s, seg) => s + seg.bytes, 0)
  const gpuTotal = result.gpuCapacity.totalBytes
  const free = Math.max(0, gpuTotal - totalUsed)

  if (totalUsed === 0) return null

  return (
    <div className={styles.breakdownSection}>
      <div className={styles.breakdownTitle}>GPU memory breakdown</div>
      <div className={styles.memoryBar}>
        {segments.map((seg, i) => {
          const pct = gpuTotal > 0 ? (seg.bytes / gpuTotal) * 100 : (seg.bytes / totalUsed) * 100
          if (pct < 0.5) return null
          return (
            <div
              key={i}
              className={styles.memorySegment}
              style={{ width: `${pct}%`, background: seg.color }}
              title={`${seg.label}: ${formatBytes(seg.bytes)} (${pct.toFixed(1)}%)`}
            >
              {pct > 8 ? seg.label : ''}
            </div>
          )
        })}
        {free > 0 && gpuTotal > 0 && (
          <div
            className={styles.memorySegment}
            style={{ width: `${(free / gpuTotal) * 100}%`, background: '#e0e0e0', color: '#3c3f42' }}
            title={`Free: ${formatBytes(free)}`}
          >
            {(free / gpuTotal) * 100 > 8 ? 'Free' : ''}
          </div>
        )}
      </div>
      <div className={styles.breakdownLegend}>
        {segments.map((seg, i) => (
          <span key={i}>
            <span className={styles.legendDot} style={{ background: seg.color }} />
            {seg.label}: {formatBytes(seg.bytes)}
          </span>
        ))}
        {free > 0 && gpuTotal > 0 && (
          <span>
            <span className={styles.legendDot} style={{ background: '#e0e0e0' }} />
            Free: {formatBytes(free)}
          </span>
        )}
      </div>
    </div>
  )
}
