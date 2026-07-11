import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Search, ChevronDown, Check } from 'lucide-react'

interface SearchableMultiSelectProps {
  value: string[]
  onChange: (items: string[]) => void
  placeholder?: string
  label: string
  popularItems: string[]
  allItems: string[]
  isItemInList?: (item: string) => boolean
  allowCustom?: boolean
  maxItems?: number
  color?: 'cyan' | 'violet'
}

export default function SearchableMultiSelect({
  value = [],
  onChange,
  placeholder = 'Search and select...',
  label,
  popularItems,
  allItems,
  isItemInList,
  allowCustom = true,
  maxItems = 20,
  color = 'cyan',
}: SearchableMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const colorMap = {
    cyan: {
      chip: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/20',
      hover: 'hover:bg-cyan-500/20 hover:text-cyan-300 hover:border-cyan-500/30',
      check: 'text-cyan-400',
    },
    violet: {
      chip: 'bg-violet-500/20 text-violet-300 border-violet-500/20',
      hover: 'hover:bg-violet-500/20 hover:text-violet-300 hover:border-violet-500/30',
      check: 'text-violet-400',
    },
  }

  const c = colorMap[color]

  // Filter items based on search query
  const filteredItems = useMemo(
    () =>
      searchQuery
        ? allItems.filter(
            (item) =>
              item.toLowerCase().includes(searchQuery.toLowerCase()) && !value.includes(item)
          )
        : [],
    [searchQuery, allItems, value]
  )

  // Popular items (not already selected) - shown when not searching
  const popularItemsToShow = useMemo(
    () => (!searchQuery ? popularItems.filter((item) => !value.includes(item)) : []),
    [searchQuery, popularItems, value]
  )

  // Check if we should show custom item option
  const showCustomItem =
    allowCustom &&
    searchQuery &&
    searchQuery.trim().length > 0 &&
    (!isItemInList || !isItemInList(searchQuery.trim())) &&
    !value.includes(searchQuery.trim()) &&
    value.length < maxItems

  const addItem = useCallback(
    (item: string) => {
      if (value.includes(item)) return
      if (value.length >= maxItems) return
      onChange([...value, item])
      setSearchQuery('')
      setHighlightedIndex(-1)
      searchInputRef.current?.focus()
    },
    [value, maxItems, onChange]
  )

  const removeItem = useCallback(
    (item: string) => {
      onChange(value.filter((i) => i !== item))
    },
    [value, onChange]
  )

  const addCustomItem = useCallback(
    (item: string) => {
      if (!item.trim()) return
      if (value.includes(item)) return
      if (value.length >= maxItems) return
      onChange([...value, item])
      setSearchQuery('')
      setHighlightedIndex(-1)
      searchInputRef.current?.focus()
    },
    [value, maxItems, onChange]
  )

  // Select option by index
  const selectOptionByIndex = useCallback(
    (index: number) => {
      let currentIndex = 0

      // Check popular items first
      if (!searchQuery) {
        if (index < popularItemsToShow.length) {
          addItem(popularItemsToShow[index])
          return
        }
        currentIndex += popularItemsToShow.length
      }

      // Check filtered items
      if (index < currentIndex + filteredItems.length) {
        addItem(filteredItems[index - currentIndex])
        return
      }
      currentIndex += filteredItems.length

      // Check custom item
      if (showCustomItem && index === currentIndex) {
        addCustomItem(searchQuery.trim())
      }
    },
    [searchQuery, popularItemsToShow, filteredItems, showCustomItem, addItem, addCustomItem]
  )

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
        setSearchQuery('')
        setHighlightedIndex(-1)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isOpen])

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
          e.preventDefault()
          setIsOpen(true)
        }
        return
      }

      const totalOptions =
        (searchQuery ? 0 : popularItemsToShow.length) + filteredItems.length + (showCustomItem ? 1 : 0)

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setHighlightedIndex((prev) => (prev < totalOptions - 1 ? prev + 1 : prev))
          break
        case 'ArrowUp':
          e.preventDefault()
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0))
          break
        case 'Enter':
          e.preventDefault()
          if (highlightedIndex >= 0) {
            selectOptionByIndex(highlightedIndex)
          } else if (showCustomItem) {
            addCustomItem(searchQuery.trim())
          }
          break
        case 'Escape':
          setIsOpen(false)
          setSearchQuery('')
          setHighlightedIndex(-1)
          break
        case 'Tab':
          setIsOpen(false)
          break
      }
    },
    [isOpen, highlightedIndex, searchQuery, popularItemsToShow, filteredItems, showCustomItem, selectOptionByIndex, addCustomItem]
  )

  const toggleDropdown = () => {
    setIsOpen(!isOpen)
    if (!isOpen) {
      setSearchQuery('')
      setHighlightedIndex(-1)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="text-xs text-white/50 uppercase tracking-wider mb-2 block">{label}</label>

      {/* Selected chips and input */}
      <div
        onClick={toggleDropdown}
        className={`glass rounded-xl border transition-colors cursor-pointer min-h-[48px] p-2 flex flex-wrap gap-2 items-center border-white/10 focus-within:border-indigo-500/50`}
      >
        {value.map((item) => (
          <motion.span
            key={item}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border ${c.chip}`}
            onClick={(e) => {
              e.stopPropagation()
              removeItem(item)
            }}
          >
            {item}
            <X className="w-3 h-3 opacity-60 hover:opacity-100" />
          </motion.span>
        ))}

        <div className="flex-1 flex items-center min-w-[120px]">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={value.length === 0 ? placeholder : ''}
            className="w-full bg-transparent text-sm text-white placeholder:text-white/25 outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        <ChevronDown
          className={`w-4 h-4 text-white/30 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </div>

      {value.length >= maxItems && (
        <p className="text-xs text-yellow-400 mt-1">Maximum {maxItems} items reached</p>
      )}

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={dropdownRef}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-full mt-2 glass rounded-xl border border-white/10 overflow-hidden max-h-[300px] overflow-y-auto"
          >
            <div className="p-3 border-b border-white/10">
              <div className="flex items-center gap-2 px-3 py-2 glass rounded-lg">
                <Search className="w-4 h-4 text-white/30" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search ${label.toLowerCase()}...`}
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-white/25 outline-none"
                  autoFocus
                />
              </div>
            </div>

            <div className="p-2">
              {/* Custom item option */}
              {showCustomItem && (
                <button
                  onClick={() => addCustomItem(searchQuery.trim())}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2"
                >
                  <X className="w-4 h-4 text-indigo-400" />
                  Add "{searchQuery.trim()}"
                </button>
              )}

              {/* Popular items (shown when no search) */}
              {!searchQuery && popularItemsToShow.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-white/40 uppercase tracking-wider px-3 py-2">
                    Popular
                  </p>
                  <div className="flex flex-wrap gap-2 px-3">
                    {popularItemsToShow.map((item) => (
                      <button
                        key={item}
                        onClick={() => addItem(item)}
                        className={`px-3 py-1.5 rounded-full text-xs bg-white/5 text-white/70 border border-white/10 transition-colors ${c.hover}`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Filtered items */}
              {filteredItems.length > 0 && (
                <div>
                  {filteredItems.map((item) => (
                    <button
                      key={item}
                      onClick={() => addItem(item)}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors flex items-center justify-between group"
                    >
                      <span>{item}</span>
                      <Check className={`w-4 h-4 opacity-0 group-hover:opacity-100 ${c.check} transition-opacity`} />
                    </button>
                  ))}
                </div>
              )}

              {/* No results */}
              {filteredItems.length === 0 && !showCustomItem && (
                <div className="px-3 py-8 text-center text-white/30 text-sm">
                  No results found
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
