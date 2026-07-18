import { keepPreviousData } from '@tanstack/react-query'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Github,
  Moon,
  PlusCircle,
  RotateCcw,
  RotateCw,
  Search,
  Star,
  Sun,
  X,
} from 'lucide-react'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useAlgoTopQuery } from './hooks/useAlgoTopQuery'
import { useDebouncedValue } from './hooks/useDebouncedValue'
import {
  buildQuestionUrl,
  type CompletionFilter,
  DIFFICULTY_LABEL,
  type Filters,
  fetchCompanies,
  fetchDepartments,
  fetchJobs,
  fetchQuestions,
  fetchTags,
  type MasteryRating,
  type Question,
  type StatusFilter,
  type UserProgress,
} from './lib/algotop'
import {
  hasQuestionNote,
  makeNoteFilename,
  makeNoteMarkdown,
  readStoredNotes,
  type UserNotes,
  writeStoredNotes,
} from './lib/notes'

const PAGE_SIZE = 20
const EMPTY_QUESTIONS: Question[] = []
const PROGRESS_STORAGE_KEY = 'algotop:user-progress:v1'
const THEME_STORAGE_KEY = 'algotop:theme'
const FILTER_STORAGE_KEY = 'algotop:filters:v1'
const NoteEditorDialog = lazy(() =>
  import('./components/NoteEditorDialog').then((module) => ({
    default: module.NoteEditorDialog,
  })),
)

const initialFilters: Filters = {
  page: 1,
  search: '',
  company: '',
  department: '',
  job: '',
  level: '',
  tag: '',
  completion: '',
  status: '',
  ordering: '-frequency',
}

const ORDERING_LABELS: Record<string, string> = {
  '-frequency': '频度高到低',
  frequency: '频度低到高',
  '-time': '最近考察',
  time: '最早考察',
  '-leetcode': '题号大到小',
  leetcode: '题号小到大',
}

const STATUS_LABELS: Record<Exclude<StatusFilter, ''>, string> = {
  unrated: '未标注',
  'rating-1': '一星',
  'rating-2': '二星',
  'rating-3': '三星',
}

const COMPLETION_LABELS: Record<Exclude<CompletionFilter, ''>, string> = {
  done: '已做',
  todo: '未做',
}

type PersistedFilters = Pick<
  Filters,
  | 'company'
  | 'department'
  | 'job'
  | 'level'
  | 'tag'
  | 'completion'
  | 'status'
  | 'ordering'
>
type Theme = 'light' | 'dark'
type ThemePreference = Theme | 'system'

function hasUrlFilterParams(params: URLSearchParams) {
  return [
    'page',
    'search',
    'company',
    'department',
    'job',
    'level',
    'tag',
    'completion',
    'status',
    'ordering',
  ].some((key) => params.has(key))
}

function readStoredFilters(): Partial<PersistedFilters> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as Record<string, unknown>
    const next: Partial<PersistedFilters> = {}

    if (typeof parsed.company === 'string') next.company = parsed.company
    if (typeof parsed.department === 'string')
      next.department = parsed.department
    if (typeof parsed.job === 'string') next.job = parsed.job
    if (typeof parsed.tag === 'string') next.tag = parsed.tag
    if (parsed.level === '1' || parsed.level === '2' || parsed.level === '3') {
      next.level = parsed.level
    }
    if (parsed.completion === 'done' || parsed.completion === 'todo') {
      next.completion = parsed.completion
    }
    if (
      parsed.status === 'unrated' ||
      parsed.status === 'rating-1' ||
      parsed.status === 'rating-2' ||
      parsed.status === 'rating-3'
    ) {
      next.status = parsed.status
    }
    if (
      typeof parsed.ordering === 'string' &&
      ORDERING_LABELS[parsed.ordering]
    ) {
      next.ordering = parsed.ordering
    }
    if (!next.company) {
      delete next.department
    }

    return next
  } catch {
    return {}
  }
}

function readInitialFilters(): Filters {
  if (typeof window === 'undefined') return initialFilters

  const params = new URLSearchParams(window.location.search)
  const next = { ...initialFilters }
  const page = Number(params.get('page'))
  const status = params.get('status')
  const completion = params.get('completion')
  const ordering = params.get('ordering')

  if (!hasUrlFilterParams(params)) {
    return { ...next, ...readStoredFilters(), page: 1, search: '' }
  }

  next.search = params.get('search') ?? ''
  next.company = params.get('company') ?? ''
  next.department = params.get('department') ?? ''
  next.job = params.get('job') ?? ''
  next.level = params.get('level') ?? ''
  next.tag = params.get('tag') ?? ''
  next.page = Number.isFinite(page) && page > 0 ? page : 1

  if (status === 'done') {
    next.completion = 'done'
  } else if (status === 'todo') {
    next.completion = 'todo'
  } else if (
    status === 'unrated' ||
    status === 'rating-1' ||
    status === 'rating-2' ||
    status === 'rating-3'
  ) {
    next.status = status
  }
  if (completion === 'done' || completion === 'todo') {
    next.completion = completion
  }
  if (ordering && ORDERING_LABELS[ordering]) {
    next.ordering = ordering
  }

  return next
}

function syncFiltersToUrl(filters: Filters) {
  if (typeof window === 'undefined') return

  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (key === 'page' && value === 1) return
    if (key === 'ordering' && value === '-frequency') return
    if (!value) return
    params.set(key, String(value))
  })

  const query = params.toString()
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
  window.history.replaceState(null, '', nextUrl)
}

function syncFiltersToStorage(filters: Filters) {
  if (typeof window === 'undefined') return

  const persisted: Partial<PersistedFilters> = {
    company: filters.company || undefined,
    department: filters.department || undefined,
    job: filters.job || undefined,
    level: filters.level || undefined,
    tag: filters.tag || undefined,
    completion: filters.completion || undefined,
    status: filters.status || undefined,
    ordering:
      filters.ordering === initialFilters.ordering
        ? undefined
        : filters.ordering,
  }

  if (Object.values(persisted).some(Boolean)) {
    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(persisted))
  } else {
    window.localStorage.removeItem(FILTER_STORAGE_KEY)
  }
}

function readStoredProgress(): UserProgress {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as Record<
      string,
      { mastery?: number; done?: boolean }
    >
    return Object.entries(parsed).reduce<UserProgress>((items, [id, item]) => {
      const mastery = item.mastery ?? 0
      const done = Boolean(item.done)

      if (mastery === 1 || mastery === 2 || mastery === 3) {
        items[id] = { mastery }
      }
      if (done) {
        items[id] = { ...(items[id] ?? {}), done }
      }

      return items
    }, {})
  } catch {
    return {}
  }
}

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light'

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function readInitialThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'light'

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored

  return 'system'
}

function MasteryStars({
  question,
  onChange,
}: {
  question: Question
  onChange: (id: number, mastery: MasteryRating) => void
}) {
  const [previewRating, setPreviewRating] = useState<MasteryRating | null>(null)
  const activeRating = previewRating ?? question.rate
  const isPreviewing = previewRating !== null

  return (
    <div
      className={`mastery-stars ${isPreviewing ? 'is-previewing' : ''}`}
      aria-label={`掌握程度 ${question.rate} 星`}
      onMouseLeave={() => setPreviewRating(null)}
    >
      {([1, 2, 3] as const).map((rating) => {
        const isSaved = question.rate >= rating
        const isActive = activeRating >= rating
        const isPreview = isPreviewing && activeRating >= rating
        const nextRating = question.rate === rating ? 0 : rating

        return (
          <button
            className={[
              'mastery-star',
              isActive ? 'is-active' : '',
              isSaved ? 'is-saved' : '',
              isPreview ? 'is-preview' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            type='button'
            key={rating}
            onMouseEnter={() => setPreviewRating(rating)}
            onFocus={() => setPreviewRating(rating)}
            onBlur={() => setPreviewRating(null)}
            onClick={() => {
              setPreviewRating(null)
              onChange(question.id, nextRating)
            }}
            aria-label={
              question.rate === rating ? '清空掌握程度' : `标记 ${rating} 星`
            }
            aria-pressed={isSaved}
            title={question.rate === rating ? '清空掌握程度' : `${rating} 星`}
          >
            <Star size={15} strokeWidth={1.7} />
          </button>
        )
      })}
    </div>
  )
}

export function App() {
  const [filters, setFilters] = useState<Filters>(() => readInitialFilters())
  const [progress, setProgress] = useState<UserProgress>(() =>
    readStoredProgress(),
  )
  const [notes, setNotes] = useState<UserNotes>(() => readStoredNotes())
  const [themePreference, setThemePreference] = useState<ThemePreference>(() =>
    readInitialThemePreference(),
  )
  const [systemTheme, setSystemTheme] = useState<Theme>(() => getSystemTheme())
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [activeNoteQuestion, setActiveNoteQuestion] = useState<Question | null>(
    null,
  )
  const theme = themePreference === 'system' ? systemTheme : themePreference
  const debouncedSearch = useDebouncedValue(filters.search, 350)
  const progressKey = useMemo(() => JSON.stringify(progress), [progress])
  const queryFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [debouncedSearch, filters],
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    if (themePreference === 'system') {
      window.localStorage.removeItem(THEME_STORAGE_KEY)
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, themePreference)
    }
  }, [themePreference])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light')
    }

    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress))
  }, [progress])

  useEffect(() => {
    writeStoredNotes(notes)
  }, [notes])

  useEffect(() => {
    syncFiltersToUrl(filters)
  }, [filters])

  useEffect(() => {
    syncFiltersToStorage(filters)
  }, [filters])

  useEffect(() => {
    if (!isAddDialogOpen && !activeNoteQuestion) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAddDialogOpen(false)
        setActiveNoteQuestion(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeNoteQuestion, isAddDialogOpen])

  const questionsQuery = useAlgoTopQuery({
    queryKey: ['questions', queryFilters, progressKey],
    queryFn: () => fetchQuestions(queryFilters, progress),
    placeholderData: keepPreviousData,
  })
  const companiesQuery = useAlgoTopQuery({
    queryKey: ['companies'],
    queryFn: fetchCompanies,
  })
  const departmentsQuery = useAlgoTopQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
  })
  const jobsQuery = useAlgoTopQuery({ queryKey: ['jobs'], queryFn: fetchJobs })
  const tagsQuery = useAlgoTopQuery({ queryKey: ['tags'], queryFn: fetchTags })

  const companies = companiesQuery.data ?? []
  const jobs = jobsQuery.data ?? []
  const tags = tagsQuery.data ?? []
  const questions = questionsQuery.data?.items ?? EMPTY_QUESTIONS
  const total = questionsQuery.data?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const departments = useMemo(() => {
    if (!filters.company) return []
    const items = departmentsQuery.data ?? []
    return items.filter(
      (department) => department.company === Number(filters.company),
    )
  }, [departmentsQuery.data, filters.company])
  const isInitialLoading = questionsQuery.isLoading && questions.length === 0
  const setQuestionMastery = useCallback(
    (id: number, mastery: MasteryRating) => {
      setProgress((current) => {
        const key = String(id)
        const next = { ...current }
        const item = { ...(next[key] ?? {}) }

        if (mastery === 0) {
          delete item.mastery
        } else {
          item.mastery = mastery
        }

        if (!item.done && !item.mastery) {
          delete next[key]
        } else {
          next[key] = item
        }

        return next
      })
    },
    [],
  )
  const setQuestionDone = useCallback((id: number, done: boolean) => {
    setProgress((current) => {
      const key = String(id)
      const next = { ...current }
      const item = { ...(next[key] ?? {}) }

      if (done) {
        item.done = true
      } else {
        delete item.done
      }

      if (!item.done && !item.mastery) {
        delete next[key]
      } else {
        next[key] = item
      }

      return next
    })
  }, [])
  const setQuestionNote = useCallback((id: number, content: string) => {
    setNotes((current) => {
      const key = String(id)
      const next = { ...current }

      if (content.length === 0) {
        delete next[key]
      } else {
        next[key] = {
          content,
          updatedAt: new Date().toISOString(),
        }
      }

      return next
    })
  }, [])
  const exportQuestionNote = useCallback(
    (question: Question) => {
      const note = notes[String(question.id)]
      if (!hasQuestionNote(note)) return

      const blob = new window.Blob([makeNoteMarkdown(question, note)], {
        type: 'text/markdown;charset=utf-8',
      })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = url
      link.download = makeNoteFilename(question)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    },
    [notes],
  )

  const columns = useMemo<ColumnDef<Question>[]>(
    () => [
      {
        accessorKey: 'displayId',
        header: '题目',
        cell: ({ row }) => (
          <a
            className='question-link'
            href={buildQuestionUrl(row.original)}
            target='_blank'
            rel='noreferrer'
          >
            <span>{row.original.displayId}.</span>
            <span>{row.original.title}</span>
          </a>
        ),
      },
      {
        accessorKey: 'level',
        header: '难度',
        cell: ({ row }) => (
          <span className={`level level-${row.original.level}`}>
            {DIFFICULTY_LABEL[row.original.level]}
          </span>
        ),
      },
      {
        accessorKey: 'time',
        header: '最近',
        cell: ({ row }) => row.original.date,
      },
      {
        accessorKey: 'frequency',
        header: '频度',
        cell: ({ row }) => (
          <div className='frequency-cell'>
            <span>{row.original.frequency}</span>
            <small>{row.original.date}</small>
          </div>
        ),
      },
      {
        accessorKey: 'rate',
        header: '掌握',
        cell: ({ row }) => (
          <MasteryStars question={row.original} onChange={setQuestionMastery} />
        ),
      },
      {
        id: 'actions',
        header: '操作',
        cell: ({ row }) => {
          const note = notes[String(row.original.id)]
          const hasNote = hasQuestionNote(note)

          return (
            <div className='action-cell'>
              <button
                className={`action-button ${row.original.done ? 'is-done' : ''}`}
                type='button'
                onClick={() =>
                  setQuestionDone(row.original.id, !row.original.done)
                }
                aria-label={row.original.done ? '标记未做' : '标记已做'}
                aria-pressed={row.original.done}
                title={row.original.done ? '已做' : '未做'}
              >
                {row.original.done ? '已做' : '未做'}
              </button>
              <button
                className={`action-button note-button ${
                  hasNote ? 'is-note-active' : ''
                }`}
                type='button'
                onClick={() => setActiveNoteQuestion(row.original)}
                aria-label={hasNote ? '编辑笔记' : '创建笔记'}
                aria-pressed={hasNote}
                title={hasNote ? '编辑笔记' : '创建笔记'}
              >
                笔记
              </button>
            </div>
          )
        },
      },
    ],
    [notes, setQuestionDone, setQuestionMastery],
  )

  const table = useReactTable({
    data: questions,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
  })

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => {
      const next = {
        ...current,
        [key]: value,
        page: key === 'page' ? Number(value) : 1,
      }

      if (key === 'company') {
        next.department = ''
      }

      return next
    })
  }

  function updateOrdering(field: 'leetcode' | 'frequency' | 'time') {
    setFilters((current) => {
      const nextOrdering = current.ordering === field ? `-${field}` : field
      return { ...current, ordering: nextOrdering, page: 1 }
    })
  }

  function clearFilters() {
    setFilters(initialFilters)
  }

  const hasFilters = Object.entries(filters).some(([key, value]) => {
    if (key === 'page') return value !== 1
    if (key === 'ordering') return value !== '-frequency'
    return value !== ''
  })
  const activeFilterChips = [
    filters.search && {
      key: 'search',
      label: '搜索',
      value: filters.search,
      clear: () => updateFilter('search', ''),
    },
    filters.company && {
      key: 'company',
      label: '公司',
      value:
        companies.find((company) => company.id === Number(filters.company))
          ?.name ?? filters.company,
      clear: () => updateFilter('company', ''),
    },
    filters.department && {
      key: 'department',
      label: '部门',
      value:
        departments.find(
          (department) => department.id === Number(filters.department),
        )?.name ?? filters.department,
      clear: () => updateFilter('department', ''),
    },
    filters.job && {
      key: 'job',
      label: '岗位',
      value:
        jobs.find((job) => job.id === Number(filters.job))?.name ?? filters.job,
      clear: () => updateFilter('job', ''),
    },
    filters.level && {
      key: 'level',
      label: '难度',
      value:
        DIFFICULTY_LABEL[
          Number(filters.level) as keyof typeof DIFFICULTY_LABEL
        ],
      clear: () => updateFilter('level', ''),
    },
    filters.tag && {
      key: 'tag',
      label: '标签',
      value:
        tags.find((tag) => tag.id === Number(filters.tag))?.name ?? filters.tag,
      clear: () => updateFilter('tag', ''),
    },
    filters.completion && {
      key: 'completion',
      label: '完成',
      value: COMPLETION_LABELS[filters.completion],
      clear: () => updateFilter('completion', ''),
    },
    filters.status && {
      key: 'status',
      label: '掌握',
      value: STATUS_LABELS[filters.status],
      clear: () => updateFilter('status', ''),
    },
    filters.ordering !== '-frequency' && {
      key: 'ordering',
      label: '排序',
      value: ORDERING_LABELS[filters.ordering] ?? filters.ordering,
      clear: () => updateFilter('ordering', '-frequency'),
    },
  ].filter(Boolean) as Array<{
    key: string
    label: string
    value: string
    clear: () => void
  }>

  return (
    <main className='app-shell'>
      <header className='topbar'>
        <a className='brand' href='/' aria-label='AlgoTop'>
          AlgoTop
        </a>
        <nav aria-label='主导航'>
          <button
            className='source-link'
            type='button'
            onClick={() => setIsAddDialogOpen(true)}
            aria-label='添加题目'
            title='添加题目'
          >
            <PlusCircle size={17} strokeWidth={1.8} />
          </button>
          <button
            className='source-link'
            type='button'
            onClick={() =>
              setThemePreference(theme === 'dark' ? 'light' : 'dark')
            }
            aria-label={theme === 'dark' ? '浅色模式' : '暗色模式'}
            title={theme === 'dark' ? '浅色模式' : '暗色模式'}
          >
            {theme === 'dark' ? (
              <Sun size={17} strokeWidth={1.8} />
            ) : (
              <Moon size={17} strokeWidth={1.8} />
            )}
          </button>
          <a
            className='source-link'
            href='https://github.com/dogxii/algoTop'
            target='_blank'
            rel='noreferrer'
            aria-label='GitHub'
            title='GitHub'
          >
            <Github size={17} strokeWidth={1.8} />
          </a>
        </nav>
      </header>

      <section className='workspace' aria-label='题目列表'>
        <div className='filters-row'>
          <label className='search-field'>
            <Search size={17} strokeWidth={1.7} />
            <input
              value={filters.search}
              onChange={(event) => updateFilter('search', event.target.value)}
              placeholder='搜索题目名称或编号'
            />
            {filters.search && (
              <button
                className='icon-button'
                type='button'
                onClick={() => updateFilter('search', '')}
                aria-label='清空搜索'
                title='清空搜索'
              >
                <X size={15} strokeWidth={1.8} />
              </button>
            )}
          </label>

          <div className='primary-filters'>
            <select
              value={filters.company}
              onChange={(event) => updateFilter('company', event.target.value)}
              aria-label='公司'
            >
              <option value=''>公司</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>

            <select
              value={filters.department}
              onChange={(event) =>
                updateFilter('department', event.target.value)
              }
              disabled={!filters.company}
              aria-label='部门'
            >
              <option value=''>部门</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>

            <select
              value={filters.job}
              onChange={(event) => updateFilter('job', event.target.value)}
              aria-label='岗位'
            >
              <option value=''>岗位</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.name}
                </option>
              ))}
            </select>

          </div>

          <button
            className={`icon-button reset-button ${hasFilters ? 'is-visible' : ''}`}
            type='button'
            onClick={clearFilters}
            disabled={!hasFilters}
            aria-hidden={!hasFilters}
            aria-label='重置筛选'
            title='重置筛选'
          >
            <RotateCcw size={15} strokeWidth={1.8} />
          </button>
        </div>

        <div className='compact-filters' aria-label='辅助筛选'>
          <select
            className='compact-select'
            value={filters.level}
            onChange={(event) => updateFilter('level', event.target.value)}
            aria-label='难度'
          >
            <option value=''>难度</option>
            <option value='1'>容易</option>
            <option value='2'>中等</option>
            <option value='3'>困难</option>
          </select>

          <select
            className='compact-select'
            value={filters.completion}
            onChange={(event) =>
              updateFilter('completion', event.target.value as CompletionFilter)
            }
            aria-label='完成'
          >
            <option value=''>完成</option>
            <option value='done'>已做</option>
            <option value='todo'>未做</option>
          </select>

          <select
            className='compact-select'
            value={filters.status}
            onChange={(event) =>
              updateFilter('status', event.target.value as StatusFilter)
            }
            aria-label='掌握'
          >
            <option value=''>掌握</option>
            <option value='unrated'>未标注</option>
            <option value='rating-1'>一星</option>
            <option value='rating-2'>二星</option>
            <option value='rating-3'>三星</option>
          </select>

          <select
            className='compact-select compact-select-wide'
            value={filters.tag}
            onChange={(event) => updateFilter('tag', event.target.value)}
            aria-label='标签'
          >
            <option value=''>标签</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>

          <select
            className='compact-select compact-select-wide'
            value={filters.ordering}
            onChange={(event) => updateFilter('ordering', event.target.value)}
            aria-label='排序'
          >
            <option value='-frequency'>频度高到低</option>
            <option value='-time'>最近考察</option>
            <option value='time'>最早考察</option>
            <option value='leetcode'>题号小到大</option>
            <option value='-leetcode'>题号大到小</option>
          </select>
        </div>

        <div
          className={`filter-chips ${activeFilterChips.length > 0 ? 'is-visible' : ''}`}
          aria-label='已选筛选'
          aria-hidden={activeFilterChips.length === 0}
        >
          {activeFilterChips.map((chip) => (
            <button
              className='filter-chip'
              type='button'
              key={chip.key}
              onClick={chip.clear}
              title={`移除${chip.label}`}
            >
              <span>{chip.label}</span>
              <strong>{chip.value}</strong>
              <X size={13} strokeWidth={1.8} />
            </button>
          ))}
        </div>

        <div className='summary-line' aria-live='polite'>
          <span>{total} 题</span>
          {questionsQuery.error && (
            <button
              className='refresh-button'
              type='button'
              onClick={() => questionsQuery.refetch()}
              aria-label='重新加载'
              title='重新加载'
            >
              <RotateCw size={15} strokeWidth={1.8} />
            </button>
          )}
        </div>

        <div className='table-wrap'>
          <table>
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const sortField =
                      header.column.id === 'displayId'
                        ? 'leetcode'
                        : header.column.id === 'frequency'
                          ? 'frequency'
                          : header.column.id === 'time'
                            ? 'time'
                            : undefined
                    return (
                      <th key={header.id}>
                        {sortField ? (
                          <button
                            className='sort-button'
                            type='button'
                            onClick={() => updateOrdering(sortField)}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            {filters.ordering.replace('-', '') === sortField &&
                              (filters.ordering.startsWith('-') ? (
                                <ArrowDown size={13} strokeWidth={1.8} />
                              ) : (
                                <ArrowUp size={13} strokeWidth={1.8} />
                              ))}
                          </button>
                        ) : (
                          flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )
                        )}
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {isInitialLoading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <tr className='skeleton-row' key={index}>
                      <td colSpan={columns.length}>
                        <span />
                      </td>
                    </tr>
                  ))
                : table.getRowModel().rows.map((row) => (
                    <tr key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {!isInitialLoading && questions.length === 0 && (
          <div className='empty-state'>暂无结果</div>
        )}

        <div className='pager' aria-label='分页'>
          <button
            className='icon-button'
            type='button'
            onClick={() => updateFilter('page', Math.max(1, filters.page - 1))}
            disabled={filters.page <= 1}
            aria-label='上一页'
            title='上一页'
          >
            <ChevronLeft size={17} strokeWidth={1.8} />
          </button>
          <span>
            {filters.page} / {totalPages}
          </span>
          <button
            className='icon-button'
            type='button'
            onClick={() =>
              updateFilter('page', Math.min(totalPages, filters.page + 1))
            }
            disabled={filters.page >= totalPages}
            aria-label='下一页'
            title='下一页'
          >
            <ChevronRight size={17} strokeWidth={1.8} />
          </button>
        </div>
      </section>

      {isAddDialogOpen && (
        <div
          className='modal-backdrop'
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsAddDialogOpen(false)
            }
          }}
        >
          <section
            className='add-dialog'
            role='dialog'
            aria-modal='true'
            aria-labelledby='add-dialog-title'
          >
            <button
              className='icon-button dialog-close'
              type='button'
              onClick={() => setIsAddDialogOpen(false)}
              aria-label='关闭'
              title='关闭'
            >
              <X size={15} strokeWidth={1.8} />
            </button>
            <p id='add-dialog-title'>暂时没有做添加功能。</p>
            <p className='add-dialog-note'>
              项目火热开发中，后续将支持账号同步、笔记一键导出等更多功能，欢迎
              Star GitHub 仓库 qwq！
            </p>
            <div className='dialog-links'>
              <a
                className='dialog-link'
                href='https://github.com/dogxii/algoTop'
                target='_blank'
                rel='noreferrer'
              >
                GitHub
              </a>
              <a
                className='dialog-link'
                href='https://dogxi.me'
                target='_blank'
                rel='noreferrer'
              >
                Dogxi 主页
              </a>
            </div>
          </section>
        </div>
      )}

      {activeNoteQuestion && (
        <div className='note-page-layer'>
          <Suspense
            fallback={
              <section
                className='note-dialog note-dialog-loading'
                role='status'
              >
                <span>加载中</span>
              </section>
            }
          >
            <NoteEditorDialog
              question={activeNoteQuestion}
              note={notes[String(activeNoteQuestion.id)]}
              value={notes[String(activeNoteQuestion.id)]?.content ?? ''}
              onChange={(value) =>
                setQuestionNote(activeNoteQuestion.id, value)
              }
              onClose={() => setActiveNoteQuestion(null)}
              onExport={() => exportQuestionNote(activeNoteQuestion)}
            />
          </Suspense>
        </div>
      )}
    </main>
  )
}
