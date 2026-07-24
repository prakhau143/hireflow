import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Search, ChevronDown, Check } from 'lucide-react'
import { SKILL_CATEGORIES, FREQUENT_SKILLS, isSkillInMasterList } from '@/data/skills'

interface SkillsMultiSelectProps {
  value: string[]
  onChange: (skills: string[]) => void
  placeholder?: string
  maxSkills?: number
  required?: boolean
  error?: string
}

export default function SkillsMultiSelect({
  value = [],
  onChange,
  placeholder = 'Search and select skills...',
  maxSkills = 30,
  required = false,
  error,
}: SkillsMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Flatten all skills with category info
  const allSkillsWithCategory = useMemo(
    () => SKILL_CATEGORIES.flatMap((category) =>
      category.skills.map((skill) => ({ skill, category: category.name }))
    ),
    []
  )

  // Filter skills based on search query
  const filteredSkills = useMemo(
    () =>
      searchQuery
        ? allSkillsWithCategory.filter(
            ({ skill }) =>
              skill.toLowerCase().includes(searchQuery.toLowerCase()) && !value.includes(skill)
          )
        : [],
    [searchQuery, allSkillsWithCategory, value]
  )

  // Group filtered skills by category (only when searching)
  const groupedSkills = useMemo(
    () =>
      searchQuery
        ? SKILL_CATEGORIES.map((category) => ({
            name: category.name,
            skills: category.skills.filter(
              (skill) =>
                skill.toLowerCase().includes(searchQuery.toLowerCase()) && !value.includes(skill)
            ),
          })).filter((group) => group.skills.length > 0)
        : [],
    [searchQuery, value]
  )

  // Frequently selected skills (not already selected) - shown when not searching
  const frequentSkills = useMemo(
    () => (!searchQuery ? FREQUENT_SKILLS.filter((skill) => !value.includes(skill)) : []),
    [searchQuery, value]
  )

  // Check if we should show custom skill option
  const showCustomSkill =
    searchQuery &&
    searchQuery.trim().length > 0 &&
    !isSkillInMasterList(searchQuery.trim()) &&
    !value.includes(searchQuery.trim()) &&
    value.length < maxSkills

  // Use refs for functions to avoid circular dependencies
  const addSkillRef = useRef<(skill: string) => void>(null)
  const addCustomSkillRef = useRef<(skill: string) => void>(null)

  const addSkill = useCallback(
    (skill: string) => {
      if (value.includes(skill)) return
      if (value.length >= maxSkills) return
      onChange([...value, skill])
      setSearchQuery('')
      setHighlightedIndex(-1)
      searchInputRef.current?.focus()
    },
    [value, maxSkills, onChange]
  )

  const removeSkill = useCallback(
    (skill: string) => {
      onChange(value.filter((s) => s !== skill))
    },
    [value, onChange]
  )

  const addCustomSkill = useCallback(
    (skill: string) => {
      if (!skill.trim()) return
      if (value.includes(skill)) return
      if (value.length >= maxSkills) return
      onChange([...value, skill])
      setSearchQuery('')
      setHighlightedIndex(-1)
      searchInputRef.current?.focus()
    },
    [value, maxSkills, onChange]
  )

  // Update refs
  useEffect(() => {
    addSkillRef.current = addSkill
    addCustomSkillRef.current = addCustomSkill
  }, [addSkill, addCustomSkill])

  // Select option by index
  const selectOptionByIndex = useCallback(
    (index: number) => {
      let currentIndex = 0

      // Check frequent skills first
      if (!searchQuery) {
        if (index < frequentSkills.length) {
          addSkillRef.current?.(frequentSkills[index])
          return
        }
        currentIndex += frequentSkills.length
      }

      // Check grouped skills
      for (const group of groupedSkills) {
        if (index < currentIndex + group.skills.length) {
          addSkillRef.current?.(group.skills[index - currentIndex])
          return
        }
        currentIndex += group.skills.length
      }

      // Check custom skill
      if (showCustomSkill && index === currentIndex) {
        addCustomSkillRef.current?.(searchQuery.trim())
      }
    },
    [searchQuery, frequentSkills, groupedSkills, showCustomSkill]
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
        (searchQuery ? 0 : frequentSkills.length) +
        groupedSkills.reduce((sum, group) => sum + group.skills.length, 0) +
        (showCustomSkill ? 1 : 0)

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
          } else if (showCustomSkill) {
            addCustomSkill(searchQuery.trim())
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
    [isOpen, highlightedIndex, searchQuery, frequentSkills, groupedSkills, showCustomSkill, selectOptionByIndex, addCustomSkill]
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
      <label className="text-xs text-muted-foreground uppercase tracking-wider mb-2 block">
        Skills {required && <span className="text-red-400">*</span>}
      </label>

      {/* Selected chips and input */}
      <div
        onClick={toggleDropdown}
        className={`glass rounded-xl border transition-colors cursor-pointer min-h-[48px] p-2 flex flex-wrap gap-2 items-center ${
          error ? 'border-red-500/50' : 'border-border focus-within:border-indigo-500/50'
        }`}
      >
        {value.map((skill) => (
          <motion.span
            key={skill}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/20"
            onClick={(e) => {
              e.stopPropagation()
              removeSkill(skill)
            }}
          >
            {skill}
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
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        </div>

        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </div>

      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      {value.length >= maxSkills && (
        <p className="text-xs text-yellow-400 mt-1">Maximum {maxSkills} skills reached</p>
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
            className="absolute z-50 w-full mt-2 glass rounded-xl border border-border overflow-hidden max-h-[400px] overflow-y-auto"
          >
            <div className="p-3 border-b border-border">
              <div className="flex items-center gap-2 px-3 py-2 glass rounded-lg">
                <Search className="w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search skills..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 outline-none"
                  autoFocus
                />
              </div>
            </div>

            <div className="p-2">
              {/* Custom skill option */}
              {showCustomSkill && (
                <button
                  onClick={() => addCustomSkill(searchQuery.trim())}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4 text-indigo-400" />
                  Add "{searchQuery.trim()}"
                </button>
              )}

              {/* Frequent skills (shown when no search) */}
              {!searchQuery && frequentSkills.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider px-3 py-2">
                    Frequently Selected
                  </p>
                  <div className="flex flex-wrap gap-2 px-3">
                    {frequentSkills.map((skill) => (
                      <button
                        key={skill}
                        onClick={() => addSkill(skill)}
                        className="px-3 py-1.5 rounded-full text-xs bg-foreground/5 text-muted-foreground hover:bg-indigo-500/20 hover:text-indigo-300 border border-border hover:border-indigo-500/30 transition-colors"
                      >
                        {skill}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Grouped skills */}
              {groupedSkills.map((group) => (
                <div key={group.name} className="mb-3 last:mb-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider px-3 py-2">
                    {group.name}
                  </p>
                  {group.skills.map((skill) => (
                    <button
                      key={skill}
                      onClick={() => addSkill(skill)}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors flex items-center justify-between group"
                    >
                      <span>{skill}</span>
                      <Check className="w-4 h-4 opacity-0 group-hover:opacity-100 text-indigo-400 transition-opacity" />
                    </button>
                  ))}
                </div>
              ))}

              {/* No results */}
              {filteredSkills.length === 0 && !showCustomSkill && (
                <div className="px-3 py-8 text-center text-muted-foreground text-sm">
                  No skills found
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
