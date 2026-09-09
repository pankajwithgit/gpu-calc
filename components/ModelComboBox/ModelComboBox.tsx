'use client'

import * as React from 'react'
import {
  Switch,
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
  isHuggingFace?: boolean
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

  const validatedItems = React.useMemo(() =>
    supportedModels ? items.filter(i => supportedModels.includes(i.value)) : items,
    [items, supportedModels])

  const activeItems = supportedOnly ? validatedItems : items
  const wasAutoReplacedRef = React.useRef(false)

  const handleToggle = (_: React.FormEvent, checked: boolean) => {
    setSupportedOnly(checked)
    if (checked) {
      prevModel.current = value
      if (!validatedItems.some(i => i.value === value) && validatedItems.length > 0) {
        onChange(validatedItems[0].value)
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

  const selectedItem = activeItems.find(i => i.value === value)

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

  const displayValue = open ? filter : (selectedItem?.label ?? value)

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
          {value && !open && selectedItem && (
            <div className={styles.selectedBadges}>
              {selectedItem.isTested && <span className={styles.testedBadge}>tested</span>}
              {selectedItem.inCatalog && !selectedItem.isTested && <span className={styles.catalogBadge}>in catalog</span>}
              {selectedItem.isHuggingFace && !selectedItem.isTested && !selectedItem.inCatalog && <span className={styles.hfBadge}>hugging face</span>}
            </div>
          )}
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
                      {item.isHuggingFace && !item.isTested && !item.inCatalog && <span className={styles.hfBadge}>hugging face</span>}
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
