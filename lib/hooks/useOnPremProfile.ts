'use client'

import { useState, useCallback, useEffect } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────

export interface OnPremCostProfile {
  id: string
  name: string
  hardware: {
    serverCostPerNode: number        // full node (GPUs + CPU + RAM + chassis), USD
    storageCostPerTb: number         // NVMe/SSD per TB, USD
    networkingCost: number           // InfiniBand switches, NICs, cables total, USD
  }
  datacenter: {
    powerRatePerKwh: number          // $/kWh
    pue: number                      // 1.0–2.0
    rackCostPerMonth: number         // per rack per month, USD
  }
  lifecycle: {
    depreciationYears: number        // 3 or 5
    maintenancePctPerYear: number    // % of hardware cost per year
    staffFtesPerNNodes: number       // staff FTEs per N nodes
    staffCostPerFte: number          // annual fully-loaded cost per FTE, USD
  }
}

export interface OnPremProfileData {
  profiles: OnPremCostProfile[]
  activeProfileId: string | null
  activeProfile: OnPremCostProfile | null
  setActiveProfile: (id: string | null) => void
  saveProfile: (p: OnPremCostProfile) => void
  deleteProfile: (id: string) => void
  exportProfile: (id: string) => string        // JSON string
  importProfile: (json: string) => void
}

// ── Defaults ───────────────────────────────────────────────────────────────

export const DEFAULT_PROFILE: Omit<OnPremCostProfile, 'id' | 'name'> = {
  hardware: {
    serverCostPerNode: 0,
    storageCostPerTb: 0,
    networkingCost: 0,
  },
  datacenter: {
    powerRatePerKwh: 0.10,
    pue: 1.4,
    rackCostPerMonth: 0,
  },
  lifecycle: {
    depreciationYears: 5,
    maintenancePctPerYear: 10,
    staffFtesPerNNodes: 2.5,
    staffCostPerFte: 200000,
  },
}

// ── Storage keys ───────────────────────────────────────────────────────────

const STORAGE_KEY_PROFILES = 'onprem_cost_profiles'
const STORAGE_KEY_ACTIVE   = 'onprem_active_profile_id'

function load(): OnPremCostProfile[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROFILES)
    return raw ? (JSON.parse(raw) as OnPremCostProfile[]) : []
  } catch {
    return []
  }
}

function save(profiles: OnPremCostProfile[]): void {
  localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(profiles))
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useOnPremProfile(): OnPremProfileData {
  const [profiles, setProfilesState] = useState<OnPremCostProfile[]>([])
  const [activeProfileId, setActiveProfileIdState] = useState<string | null>(null)

  useEffect(() => {
    setProfilesState(load())
    setActiveProfileIdState(localStorage.getItem(STORAGE_KEY_ACTIVE))
  }, [])

  const setProfiles = useCallback((updater: OnPremCostProfile[] | ((prev: OnPremCostProfile[]) => OnPremCostProfile[])) => {
    setProfilesState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      save(next)
      return next
    })
  }, [])

  const setActiveProfile = useCallback((id: string | null) => {
    setActiveProfileIdState(id)
    if (id) {
      localStorage.setItem(STORAGE_KEY_ACTIVE, id)
    } else {
      localStorage.removeItem(STORAGE_KEY_ACTIVE)
    }
  }, [])

  const saveProfile = useCallback((p: OnPremCostProfile) => {
    setProfiles(prev => {
      const idx = prev.findIndex(x => x.id === p.id)
      return idx >= 0 ? prev.map(x => x.id === p.id ? p : x) : [...prev, p]
    })
  }, [setProfiles])

  const deleteProfile = useCallback((id: string) => {
    setProfiles(prev => prev.filter(x => x.id !== id))
    setActiveProfileIdState(prev => prev === id ? null : prev)
  }, [setProfiles])

  const exportProfile = useCallback((id: string): string => {
    const p = profiles.find(x => x.id === id)
    return p ? JSON.stringify(p, null, 2) : '{}'
  }, [profiles])

  const importProfile = useCallback((json: string) => {
    try {
      const p = JSON.parse(json) as OnPremCostProfile
      if (!p.id) p.id = String(Date.now())
      if (!p.name) p.name = 'Imported profile'
      saveProfile(p)
    } catch {
      console.warn('useOnPremProfile: failed to parse imported JSON')
    }
  }, [saveProfile])

  const activeProfile = profiles.find(x => x.id === activeProfileId) ?? null

  return {
    profiles,
    activeProfileId,
    activeProfile,
    setActiveProfile,
    saveProfile,
    deleteProfile,
    exportProfile,
    importProfile,
  }
}
