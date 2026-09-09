'use client'

import * as React from 'react'
import {
  Switch,
  Checkbox,
  Select,
  SelectList,
  SelectGroup,
  SelectOption,
  MenuToggle,
  TextInputGroup,
  TextInputGroupMain,
  TextInputGroupUtilities,
  Button,
} from '@patternfly/react-core'
import TimesIcon from '@patternfly/react-icons/dist/esm/icons/times-icon'
import { getAppConfig } from '@/lib/app-config'
import styles from './ModelComboBox.module.css'

export interface ComboBoxItem {
  value: string
  label: string
  group: string
  isTested?: boolean
  inCatalog?: boolean
  requiresHfToken?: boolean
}

interface ComboBoxProps {
  value: string
  onChange: (value: string) => void
  items: ComboBoxItem[]
  placeholder?: string
  id?: string
  allowCustom?: boolean
  supportedModels?: string[]
  hfToken?: string
  helperText?: React.ReactNode
}

interface GroupedItems {
  group: string
  items: ComboBoxItem[]
}

function groupItems(items: ComboBoxItem[]): GroupedItems[] {
  const map = new Map<string, ComboBoxItem[]>()
  for (const item of items) {
    if (!map.has(item.group)) map.set(item.group, [])
    map.get(item.group)!.push(item)
  }
  return Array.from(map, ([group, items]) => ({
    group,
    items: items.toSorted((a, b) => a.label.localeCompare(b.label)),
  })).toSorted((a, b) => a.group.localeCompare(b.group))
}

const FP8_SUFFIX_RE = /-FP8(-\w+)*$/

const NVFP4_SUFFIX_RE = /-NVFP4(-\w+)*$/

function isFp8Model(modelId: string): boolean {
  return FP8_SUFFIX_RE.test(modelId)
}

function isNvfp4Model(modelId: string): boolean {
  return NVFP4_SUFFIX_RE.test(modelId)
}

function toBaseModelId(modelId: string): string {
  return modelId.replace(FP8_SUFFIX_RE, '').replace(NVFP4_SUFFIX_RE, '')
}

function suggestedNames(): string {
  const names = getAppConfig().suggestedModelNames
  return names.length > 0 ? names.join(', ') : 'Nemotron, DeepSeek V4, Gemma 4, Kimi'
}

export function ComboBox({ value, onChange, items, placeholder, id, allowCustom = false, supportedModels, hfToken, helperText }: ComboBoxProps) {
  const [open, setOpen] = React.useState(false)
  const [filter, setFilter] = React.useState('')
  const [supportedOnly, setSupportedOnly] = React.useState(false)
  const prevModel = React.useRef(value)
  const [focusIndex, setFocusIndex] = React.useState(-1)
  const textInputRef = React.useRef<HTMLInputElement>(null)
  const toggleRef = React.useRef<HTMLDivElement>(null)

  const variantMap = React.useMemo(() => {
    const map = new Map<string, { fp8?: string; nvfp4?: string }>()
    for (const item of items) {
      const base = toBaseModelId(item.value)
      if (base === item.value) continue
      if (!map.has(base)) map.set(base, {})
      const entry = map.get(base)!
      if (isFp8Model(item.value)) entry.fp8 = item.value
      else if (isNvfp4Model(item.value)) entry.nvfp4 = item.value
    }
    return map
  }, [items])

  const currentBase = toBaseModelId(value)
  const activeVariant: 'fp8' | 'nvfp4' | null = isFp8Model(value) ? 'fp8' : isNvfp4Model(value) ? 'nvfp4' : null
  const variants = variantMap.get(currentBase)

  const baseItems = React.useMemo(() =>
    items.filter(i => !isFp8Model(i.value) && !isNvfp4Model(i.value)),
    [items])

  const validatedBaseItems = React.useMemo(() =>
    supportedModels ? baseItems.filter(i => {
      if (supportedModels.includes(i.value)) return true
      const v = variantMap.get(i.value)
      if (!v) return false
      return (v.fp8 != null && supportedModels.includes(v.fp8)) ||
             (v.nvfp4 != null && supportedModels.includes(v.nvfp4))
    }) : baseItems,
    [baseItems, supportedModels, variantMap])

  const activeItems = supportedOnly ? validatedBaseItems : baseItems
  const wasAutoReplacedRef = React.useRef(false)

  const handleToggle = (_: React.FormEvent, checked: boolean) => {
    setSupportedOnly(checked)
    if (checked) {
      prevModel.current = value
      if (!validatedBaseItems.some(i => i.value === currentBase) && validatedBaseItems.length > 0) {
        onChange(validatedBaseItems[0].value)
        wasAutoReplacedRef.current = true
      } else {
        wasAutoReplacedRef.current = false
      }
    } else {
      // Only restore prevModel if enabling the filter caused an auto-replacement
      if (wasAutoReplacedRef.current) {
        onChange(prevModel.current)
      }
      wasAutoReplacedRef.current = false
    }
  }

  const selectedItem = activeItems.find(i => i.value === currentBase)

  const filtered = React.useMemo(() => {
    if (!filter) return activeItems
    const q = filter.toLowerCase()
    return activeItems.filter(i =>
      i.label.toLowerCase().includes(q) ||
      i.value.toLowerCase().includes(q) ||
      i.group.toLowerCase().includes(q)
    )
  }, [activeItems, filter])

  const groups = React.useMemo(() => groupItems(filtered), [filtered])

  const flatItems = React.useMemo(() => {
    const flat: ComboBoxItem[] = []
    for (const g of groups) flat.push(...g.items)
    return flat
  }, [groups])

  const exactMatch = items.some(i => i.value.toLowerCase() === filter.toLowerCase() || i.label.toLowerCase() === filter.toLowerCase())
  const showCustom = allowCustom && open && filter.trim() && !exactMatch

  function selectItem(val: string) {
    if (supportedOnly) {
      prevModel.current = val
    }
    onChange(val)
    setOpen(false)
    setFilter('')
    setFocusIndex(-1)
  }

  function handleInputChange(_event: React.FormEvent<HTMLInputElement>, val: string) {
    setFilter(val)
    setFocusIndex(-1)
    if (!open) setOpen(true)
  }

  function handleInputFocus() {
    setOpen(true)
    setFilter('')
  }

  function handleInputKeyDown(event: React.KeyboardEvent) {
    const totalItems = flatItems.length + (showCustom ? 1 : 0)

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (totalItems === 0) { if (!open) setOpen(true); break }
        setFocusIndex(prev => (prev + 1) % totalItems)
        if (!open) setOpen(true)
        break
      case 'ArrowUp':
        event.preventDefault()
        if (totalItems === 0) { if (!open) setOpen(true); break }
        setFocusIndex(prev => (prev <= 0 ? totalItems - 1 : prev - 1))
        if (!open) setOpen(true)
        break
      case 'Enter':
        event.preventDefault()
        if (focusIndex >= 0 && focusIndex < flatItems.length) {
          selectItem(flatItems[focusIndex].value)
        } else if (focusIndex === flatItems.length && showCustom) {
          selectItem(filter.trim())
        } else if (allowCustom && filter.trim()) {
          selectItem(filter.trim())
        } else if (flatItems.length === 1) {
          selectItem(flatItems[0].value)
        }
        break
      case 'Escape':
        setOpen(false)
        setFilter('')
        setFocusIndex(-1)
        textInputRef.current?.blur()
        break
      case 'Tab':
        setOpen(false)
        setFilter('')
        setFocusIndex(-1)
        break
    }
  }

  function handleClear() {
    onChange('')
    setFilter('')
    setFocusIndex(-1)
    textInputRef.current?.focus()
  }

  function handleSelect(_event: React.MouseEvent | undefined, val: string | number | undefined) {
    if (val === '__custom__') {
      selectItem(filter.trim())
    } else if (typeof val === 'string') {
      selectItem(val)
    }
  }

  function handleQuantToggle(variant: 'fp8' | 'nvfp4') {
    return (_: React.FormEvent<HTMLInputElement>, checked: boolean) => {
      if (checked && variants?.[variant]) {
        onChange(variants[variant]!)
      } else {
        onChange(currentBase)
      }
    }
  }

  const displayValue = open ? filter : (activeVariant ? value : (selectedItem?.label ?? value))

  const toggle = (tRef: React.RefObject<HTMLDivElement | HTMLButtonElement>) => (
    <MenuToggle
      ref={tRef as React.RefObject<HTMLButtonElement>}
      variant="typeahead"
      aria-label="Model selector"
      onClick={() => { setOpen(prev => !prev); if (!open) setFilter('') }}
      isExpanded={open}
      isFullWidth
      className={styles.menuToggle}
    >
      <TextInputGroup isPlain>
        <TextInputGroupMain
          value={displayValue}
          onClick={() => { if (!open) { setOpen(true); setFilter('') } }}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleInputKeyDown}
          id={id}
          autoComplete="off"
          innerRef={textInputRef}
          placeholder={placeholder ?? 'Type or select...'}
          role="combobox"
          isExpanded={open}
          aria-controls={id ? `${id}-listbox` : undefined}
          aria-activedescendant={focusIndex >= 0 ? `${id}-opt-${focusIndex}` : undefined}
        />
        <TextInputGroupUtilities>
          {value && !open && (
            <Button variant="plain" onClick={handleClear} aria-label="Clear selection" className={styles.clearBtn}>
              <TimesIcon />
            </Button>
          )}
        </TextInputGroupUtilities>
      </TextInputGroup>
    </MenuToggle>
  )

  return (
    <div className={styles.wrapper}>
      <div className={styles.labelRow}>
        <label className={styles.label} htmlFor={id}>Model — Hugging Face ID</label>
        {supportedModels && (
          <Switch
            id={id ? `${id}-validated-only` : 'validated-only'}
            label="Tested only"
            isChecked={supportedOnly}
            onChange={handleToggle}
            isReversed
          />
        )}
      </div>

      <Select
        id={id ? `${id}-select` : undefined}
        isOpen={open}
        selected={value}
        onSelect={handleSelect}
        onOpenChange={isOpen => { setOpen(isOpen); if (!isOpen) { setFilter(''); setFocusIndex(-1) } }}
        toggle={toggle}
        shouldFocusFirstItemOnOpen={false}
        popperProps={{ width: 'trigger', maxWidth: 'trigger' }}
      >
        <SelectList id={id ? `${id}-listbox` : undefined} className={styles.selectList}>
          {groups.length === 0 && !showCustom && (
            <SelectOption isDisabled value="__empty__">
              No matches
            </SelectOption>
          )}

          {groups.map(group => {
            const options = group.items.map(item => {
              const idx = flatItems.indexOf(item)
              return (
                <SelectOption
                  key={item.value}
                  id={`${id}-opt-${idx}`}
                  value={item.value}
                  isFocused={idx === focusIndex}
                  isSelected={item.value === value}
                  onMouseEnter={() => setFocusIndex(idx)}
                >
                  <div className={styles.optionRow}>
                    <span>{item.label}</span>
                    <div className={styles.badges}>
                      {item.isTested && <span className={styles.testedBadge}>tested</span>}
                      {item.inCatalog && !item.isTested && <span className={styles.catalogBadge}>in catalog</span>}
                      {item.requiresHfToken && <span className={styles.hfTokenBadge}>requires HF token</span>}
                    </div>
                  </div>
                </SelectOption>
              )
            })

            return group.group ? (
              <SelectGroup key={group.group} label={group.group}>
                {options}
              </SelectGroup>
            ) : (
              <React.Fragment key="__ungrouped__">
                {options}
              </React.Fragment>
            )
          })}

          {showCustom && (
            <SelectOption
              id={`${id}-opt-${flatItems.length}`}
              value="__custom__"
              isFocused={focusIndex === flatItems.length}
              onMouseEnter={() => setFocusIndex(flatItems.length)}
              className={styles.customOption}
            >
              <span className={styles.customOptionLabel}>Use:</span>
              {filter.trim()}
            </SelectOption>
          )}
        </SelectList>
      </Select>

      {variants && (variants.fp8 || variants.nvfp4) && (
        <div className={styles.quantRow}>
          {variants.fp8 && (
            <Checkbox
              id={id ? `${id}-fp8` : 'fp8-toggle'}
              label="Use FP8 quantization"
              isChecked={activeVariant === 'fp8'}
              onChange={handleQuantToggle('fp8')}
            />
          )}
          {variants.nvfp4 && (
            <Checkbox
              id={id ? `${id}-nvfp4` : 'nvfp4-toggle'}
              label="Use NVFP4 quantization"
              isChecked={activeVariant === 'nvfp4'}
              onChange={handleQuantToggle('nvfp4')}
            />
          )}
        </div>
      )}

      {supportedModels && (
        <div className={styles.helperText}>
          {helperText ?? (supportedOnly ? (
              <span>Tested: {suggestedNames()}, ... — type to autocomplete</span>
            ) : (
              <>
                <div>Tested: {suggestedNames()}, ... — type to autocomplete</div>
                {value && !supportedModels.includes(value) && getAppConfig().modelRequestUrl && (
                  <div>New model? <a href={getAppConfig().modelRequestUrl + encodeURIComponent(value)} target="_blank" rel="noopener" className={styles.requestLink}>Request testing →</a></div>
                )}
                {hfToken ? (
                  <div style={{ color: '#0066cc', fontWeight: 500 }}>HF token active</div>
                ) : (
                  <div>Gated model? <a href="/settings" className={styles.requestLink}>Add your HF token in Settings →</a></div>
                )}
              </>
            )
          )}
        </div>
      )}
    </div>
  )
}
